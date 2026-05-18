import { onMount, tick } from "svelte";
import { invalidateAll } from "$app/navigation";
import { prepareMarkdownText } from "../utils/markdownUtils";
import { createTimeFormatter, normalizeText } from "../utils/messageUtils";
import { calculateCurrentTurns, isTurnLimitReached } from "../utils/sessionUtils";
import type { Ao3MessageMetadata } from "./ao3/helpers";
import { postAction } from "./apiService";
import { attemptAgentReply, type SendAttemptResult } from "./chatFlowController";
import { buildChatMessages, type ChatMessage, parsePersistedMessageDate, updateMessageById } from "./chatMessages";
import type { ChatOpeningState, ChatUser } from "./discord/types";
import { initUserPool } from "./discord/userPool";
import { getOpeningStateMessages } from "./messageTransformer";
import type { TutorFeedback } from "./types";

export interface PracticeSessionLabels {
	stillProcessingMessage: string;
	retryFailedMessage: string;
	earlier: string;
}

export interface PracticeSessionOptions {
	userName: string;
	avatarUrl: string;
	language: string;
	existingSession: any;
	openingState: unknown;
	maxTurns: number;
	agentStartsFirst: boolean;
	timeZone?: string;
	labels: PracticeSessionLabels;
	joinTriggerText: string;
	isHiddenCheck?: (message: { content: string }) => boolean;
	onPoolInit?: (pool: ReturnType<typeof initUserPool>) => void;
}

function getSessionSnapshot(session: {
	status?: unknown;
	messages?: Array<{ id: unknown; status?: unknown; content?: unknown; clientMessageId?: unknown; createdAt?: unknown; llmMetadata?: unknown }>;
}): string {
	const messagesSnapshot = (Array.isArray(session.messages) ? session.messages : [])
		.map((m) => [m.id, m.status, m.content, (m as any).clientMessageId ?? "", stableMetadataSnapshot(m.llmMetadata), m.createdAt].join(":"))
		.join("|");
	return `${session.status ?? ""}::${messagesSnapshot}`;
}

function stableMetadataSnapshot(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return "";
	const metadata = value as { clientMessageId?: unknown; failed?: unknown; hidden?: unknown; mailBodyHtml?: unknown };
	return JSON.stringify({
		clientMessageId: metadata.clientMessageId ?? "",
		failed: metadata.failed === true,
		hidden: metadata.hidden === true,
		mailBodyHtml: typeof metadata.mailBodyHtml === "string" ? metadata.mailBodyHtml : "",
	});
}

/**
 * Extract the agent display name from opening state's previous messages.
 * Returns the first sender that doesn't match the userName, or the fallback.
 */
export function resolveAgentName(openingStateData: ChatOpeningState, userName: string, fallbackName: string): string {
	const previousMessages = Array.isArray(openingStateData.previousMessages) ? openingStateData.previousMessages : [];
	for (const message of previousMessages) {
		const sender = normalizeText((message as any).sender ?? (message as any).author, "");
		if (sender && sender !== userName) return sender;
	}
	return fallbackName;
}

export function createPracticeSession(getOptions: () => PracticeSessionOptions) {
	const options = getOptions();
	const {
		userName,
		avatarUrl,
		existingSession,
		openingState,
		maxTurns,
		agentStartsFirst,
		timeZone,
		labels,
		joinTriggerText,
		isHiddenCheck,
		onPoolInit,
	} = options;

	const openingStateData = $derived((openingState ?? {}) as ChatOpeningState);
	const formatTimestamp = $derived(createTimeFormatter(timeZone));

	// ── State ──────────────────────────────────────────────────────

	let sessionId = $state<number | null>(null);
	let lastLoadedSessionId = $state<number | null>(null);
	let lastSessionSnapshot = $state("");
	let isSubmitting = $state(false);
	let isEntering = $state(true);
	let hasAutoCompleted = $state(false);
	let isCompleting = $state(false);
	let isCompleted = $state(false);
	let showEvaluationModal = $state(false);
	let isInitializing = $state(false);
	let feedback = $state<TutorFeedback | null>(null);
	let messages = $state<ChatMessage[]>([]);
	let agentUser = $state<ChatUser>({
		id: "agent",
		name: "Agent",
		status: "Online",
		color: "bg-[#5865F2]",
		isAgent: true,
	});

	let inputText = $state("");
	let chatContainer = $state<HTMLElement | null>(null);

	// ── Derived ────────────────────────────────────────────────────

	const agentName = $derived(resolveAgentName(openingStateData, userName, agentUser.name));
	const isWaitingRetry = $derived(messages.some((m) => m.deliveryState === "failed" && !m.isHidden));
	const isAnyMessagePending = $derived(messages.some((m) => m.deliveryState === "pending" && !m.isHidden));
	const isTyping = $derived((isInitializing || isSubmitting || isAnyMessagePending) && !isWaitingRetry);
	const currentTurns = $derived(calculateCurrentTurns(messages, agentStartsFirst));
	const limitReached = $derived(isTurnLimitReached(currentTurns, maxTurns ?? 0));
	const remainingTurns = $derived(maxTurns > 0 ? Math.max(0, maxTurns - currentTurns) : null);
	const disabled = $derived(isSubmitting || isCompleting || isCompleted || isInitializing || limitReached || !sessionId || isWaitingRetry);

	// ── Agent message helpers ──────────────────────────────────────

	function addAgentMessage(params: {
		text: string;
		deliveryState: "sent" | "pending" | "failed";
		clientMessageId?: string;
		retryText?: string;
		messagePatch?: Partial<ChatMessage>;
	}) {
		messages = [
			...messages,
			{
				id: crypto.randomUUID(),
				role: "agent",
				text: params.text,
				timestamp: formatTimestamp(new Date()),
				authorName: agentName,
				avatarColor: agentUser.color,
				deliveryState: params.deliveryState,
				clientMessageId: params.clientMessageId,
				retryText: params.retryText,
				...params.messagePatch,
			},
		];
	}

	function applySendResult(result: SendAttemptResult, clientMessageId: string, retryText?: string, agentMessagePatch?: Partial<ChatMessage>) {
		if (result.status === "reply") {
			addAgentMessage({ text: result.text, deliveryState: "sent", clientMessageId, messagePatch: agentMessagePatch });
			if (result.terminated) handleComplete();
		} else if (result.status === "pending") {
			addAgentMessage({ text: labels.stillProcessingMessage, deliveryState: "pending", clientMessageId, messagePatch: agentMessagePatch });
		} else if (result.status === "failed") {
			addAgentMessage({
				text: labels.retryFailedMessage,
				deliveryState: "failed",
				clientMessageId,
				retryText,
				messagePatch: agentMessagePatch,
			});
		} else if (result.status === "rejected") {
			console.warn("Backend rejected the message");
		}
	}

	// ── Actions ────────────────────────────────────────────────────

	async function scrollToBottom() {
		await tick();
		if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
	}

	async function handleRetry(messageId: string) {
		if (isSubmitting || isCompleted || isInitializing || !sessionId) return;

		const message = messages.find((m) => m.id === messageId);
		if (!message?.clientMessageId) return;

		messages = updateMessageById(messages, messageId, (m) => ({ ...m, isHidden: true }));
		await scrollToBottom();

		isSubmitting = true;

		const retryText = message.retryText || message.text;
		const originalUserMessage = messages.find((m) => m.role === "user" && m.clientMessageId === message.clientMessageId);
		const retryExtraFields: Record<string, string> = {};
		if (originalUserMessage?.ao3?.targetCommentId) {
			retryExtraFields.ao3TargetCommentId = originalUserMessage.ao3.targetCommentId;
		}
		const result = await attemptAgentReply(sessionId, retryText, message.clientMessageId, retryExtraFields);

		applySendResult(result, message.clientMessageId, retryText, {
			authorName: message.authorName,
			ao3: message.ao3,
		});

		await scrollToBottom();
		await invalidateAll();
		isSubmitting = false;
	}

	async function handleComplete() {
		if (!sessionId || isCompleting || isCompleted) return;
		isCompleting = true;
		try {
			const result = await postAction("complete", sessionId);

			if (result.type === "success" && result.data) {
				isCompleted = true;
				feedback = result.data.feedback as TutorFeedback;
				showEvaluationModal = true;
				await scrollToBottom();
				await invalidateAll();
			}
		} catch (error) {
			console.error("Completion failed:", error);
		} finally {
			isCompleting = false;
		}
	}

	async function handleSend(
		text: string,
		extraFields: Record<string, string> = {},
		messagePatches: { user?: Partial<ChatMessage>; agent?: Partial<ChatMessage> } = {},
	) {
		if (!text.trim() || disabled) return;

		const currentText = prepareMarkdownText(text);
		const clientMessageId = crypto.randomUUID();
		const resolvedExtraFields = Object.fromEntries(
			Object.entries(extraFields).map(([key, value]) => [key, value.replaceAll("{clientMessageId}", clientMessageId)]),
		);
		const resolveAo3Patch = (patch?: Partial<ChatMessage>) => {
			if (!patch?.ao3) return patch;
			const ao3 = Object.fromEntries(
				Object.entries(patch.ao3).map(([key, value]) => [
					key,
					typeof value === "string" ? value.replaceAll("{clientMessageId}", clientMessageId) : value,
				]),
			) as Ao3MessageMetadata;
			return { ...patch, ao3 };
		};
		const userPatch = resolveAo3Patch(messagePatches.user);
		const agentPatch = resolveAo3Patch(messagePatches.agent);

		isSubmitting = true;

		messages = [
			...messages,
			{
				id: crypto.randomUUID(),
				role: "user",
				text: currentText,
				timestamp: formatTimestamp(new Date()),
				authorName: userName,
				avatar: avatarUrl,
				clientMessageId,
				...userPatch,
			},
		];
		await scrollToBottom();

		const result = await attemptAgentReply(sessionId as number, currentText, clientMessageId, resolvedExtraFields);

		applySendResult(result, clientMessageId, currentText, agentPatch);

		await scrollToBottom();
		await invalidateAll();
		isSubmitting = false;
	}

	function runAutoCompleteIfNeeded() {
		if (limitReached && !isWaitingRetry && !isCompleting && !isCompleted && sessionId && !hasAutoCompleted && !isSubmitting) {
			hasAutoCompleted = true;
			void handleComplete();
		}
	}

	function hydrateFromExistingSession(sessionData: any) {
		const sessionSnapshot = getSessionSnapshot(sessionData);

		if (sessionData.id !== lastLoadedSessionId || sessionSnapshot !== lastSessionSnapshot) {
			const currentId = sessionData.id;
			lastLoadedSessionId = currentId;
			lastSessionSnapshot = sessionSnapshot;
			sessionId = currentId;

			const pool = initUserPool(currentId);
			agentUser = { ...pool.agentUser };
			onPoolInit?.(pool);

			isCompleted = sessionData.status === "completed" || sessionData.status === "evaluated";
			feedback = sessionData.tutorFeedback || null;

			if (isCompleted && feedback) showEvaluationModal = true;

			const openingMessages = getOpeningStateMessages({
				openingStateData,
				userName,
				agentUser,
				avatarUrl,
				labels: { earlier: labels.earlier },
			});

			const sortedRawMessages = [...(sessionData.messages ?? [])].sort(
				(a: { createdAt: string | Date }, b: { createdAt: string | Date }) =>
					parsePersistedMessageDate(a.createdAt).getTime() - parsePersistedMessageDate(b.createdAt).getTime(),
			);

			const sessionMessages = buildChatMessages({
				rawMessages: sortedRawMessages,
				formatTimestamp,
				userName,
				agentName: agentName,
				avatarUrl,
				agentColor: agentUser.color,
				labels,
				isHidden: isHiddenCheck ? (m) => isHiddenCheck(m as { content: string }) : undefined,
			});

			messages = [...openingMessages, ...sessionMessages];

			tick().then(() => {
				if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
			});
		}
	}

	async function initializeFreshSession() {
		if (existingSession) return;

		isInitializing = true;
		try {
			const startResult = await postAction("start", null);

			if (startResult.type === "success" && startResult.data) {
				const currentId = startResult.data.sessionId as number;
				sessionId = currentId;
				lastLoadedSessionId = currentId;

				const pool = initUserPool(currentId);
				agentUser = { ...pool.agentUser };
				onPoolInit?.(pool);

				const openingMessages = getOpeningStateMessages({
					openingStateData,
					userName,
					agentUser,
					avatarUrl,
					labels: { earlier: labels.earlier },
				});

				if (agentStartsFirst) {
					messages = [
						...openingMessages,
						{
							id: crypto.randomUUID(),
							role: "user",
							text: joinTriggerText,
							timestamp: formatTimestamp(new Date()),
							authorName: userName,
							avatar: avatarUrl,
							isHidden: true,
						},
					];

					await scrollToBottom();

					const result = await attemptAgentReply(currentId, joinTriggerText, `join-${currentId}`);

					applySendResult(result, `join-${currentId}`);
				} else {
					messages = [...openingMessages];
				}

				await scrollToBottom();
				await invalidateAll();
			}
		} catch (error) {
			console.error("Initialization failed:", error);
		} finally {
			isInitializing = false;
		}
	}

	// ── Effects ────────────────────────────────────────────────────

	$effect(() => {
		runAutoCompleteIfNeeded();
	});

	$effect(() => {
		if (existingSession) {
			hydrateFromExistingSession(existingSession);
		}
	});

	$effect(() => {
		const needsPolling = messages.some((m) => m.deliveryState === "pending" && !m.isHidden);
		if (needsPolling && !isSubmitting && sessionId) {
			const interval = setInterval(() => {
				invalidateAll();
			}, 3000);
			return () => clearInterval(interval);
		}
	});

	onMount(() => {
		const enterTimeout = setTimeout(() => {
			isEntering = false;
		}, 300);

		void initializeFreshSession();

		return () => {
			clearTimeout(enterTimeout);
		};
	});

	return {
		get sessionId() {
			return sessionId;
		},
		get isSubmitting() {
			return isSubmitting;
		},
		get isEntering() {
			return isEntering;
		},
		set isEntering(v: boolean) {
			isEntering = v;
		},
		get isCompleting() {
			return isCompleting;
		},
		get isCompleted() {
			return isCompleted;
		},
		get showEvaluationModal() {
			return showEvaluationModal;
		},
		set showEvaluationModal(v: boolean) {
			showEvaluationModal = v;
		},
		get isInitializing() {
			return isInitializing;
		},
		get feedback() {
			return feedback;
		},
		get messages() {
			return messages;
		},
		get agentUser() {
			return agentUser;
		},
		get inputText() {
			return inputText;
		},
		set inputText(v: string) {
			inputText = v;
		},
		get chatContainer() {
			return chatContainer;
		},
		set chatContainer(v: HTMLElement | null) {
			chatContainer = v;
		},
		get isWaitingRetry() {
			return isWaitingRetry;
		},
		get isAnyMessagePending() {
			return isAnyMessagePending;
		},
		get isTyping() {
			return isTyping;
		},
		get currentTurns() {
			return currentTurns;
		},
		get limitReached() {
			return limitReached;
		},
		get remainingTurns() {
			return remainingTurns;
		},
		get disabled() {
			return disabled;
		},
		get agentName() {
			return agentName;
		},
		get openingStateData() {
			return openingStateData;
		},
		handleSend,
		handleComplete,
		handleRetry,
		runAutoCompleteIfNeeded,
		hydrateFromExistingSession,
		initializeFreshSession,
		scrollToBottom,
	};
}
