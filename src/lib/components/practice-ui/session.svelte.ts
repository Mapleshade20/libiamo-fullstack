import { onMount, tick } from "svelte";
import { invalidateAll } from "$app/navigation";
import { prepareMarkdownText } from "../utils/markdownUtils";
import { createTimeFormatter, normalizeText } from "../utils/messageUtils";
import { calculateCurrentTurns, isTurnLimitReached } from "../utils/sessionUtils";
import { completeAction, postAction, requestAgentFirstReplyAction } from "./apiService";
import { attemptAgentReply, type SendAttemptResult } from "./chatFlowController";
import { buildChatMessages, type ChatMessage, getSessionSnapshot, parsePersistedMessageDate, updateMessageById } from "./chatMessages";
import type { CommentThreadMetadata } from "./commentThread";
import type { ChatOpeningState, ChatUser } from "./discord/types";
import { initUserPool } from "./discord/userPool";
import { getOpeningStateMessages } from "./messageTransformer";

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
	onPoolInit?: (pool: ReturnType<typeof initUserPool>) => void;
	taskId?: string | number;
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
	// Use $derived to keep values reactive after invalidateAll() re-runs getOptions().
	// One-time destructuring would capture stale values and never update.
	const userName = $derived(getOptions().userName);
	const avatarUrl = $derived(getOptions().avatarUrl);
	const existingSession = $derived(getOptions().existingSession);
	const openingState = $derived(getOptions().openingState);
	const maxTurns = $derived(getOptions().maxTurns);
	const agentStartsFirst = $derived(getOptions().agentStartsFirst);
	const timeZone = $derived(getOptions().timeZone);
	const labels = $derived(getOptions().labels);
	const onPoolInit = $derived(getOptions().onPoolInit);
	const taskId = $derived(getOptions().taskId);

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
	let isInitializing = $state(false);
	let messages = $state<ChatMessage[]>([]);
	let pendingReplyTargetId = $state<string | null>(null);
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
		pendingReplyTargetId = null;
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
			if (result.terminated) handleCompleteAndNavigate(String(taskId ?? ""));
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

	function mapOpeningActionResult(result: any): SendAttemptResult {
		if (result?.type === "failure" && result.status >= 400 && result.status < 500) {
			return { status: "rejected" };
		}
		if (result?.type === "success" && result.data) {
			if ((result.data as any).pending) return { status: "pending" };
			return {
				status: "reply",
				text: result.data.reply as string,
				terminated: (result.data as any).terminated ?? false,
			};
		}
		return { status: "failed" };
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
		if (originalUserMessage?.thread?.targetCommentId) {
			retryExtraFields.threadTargetCommentId = originalUserMessage.thread.targetCommentId;
		}
		const result = await attemptAgentReply(sessionId, retryText, message.clientMessageId, retryExtraFields);

		applySendResult(result, message.clientMessageId, retryText, {
			authorName: message.authorName,
			thread: message.thread,
		});

		await scrollToBottom();
		await invalidateAll();
		isSubmitting = false;
	}

	async function handleCompleteAndNavigate(taskId: string) {
		if (!sessionId || isCompleting || isCompleted) return;
		isCompleting = true;
		try {
			const result = await completeAction(sessionId);

			if (result.type === "success") {
				isCompleted = true;
				// Navigate to feedback page
				window.location.href = `/task/${taskId}/feedback`;
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
		const resolveThreadMetadata = <T extends CommentThreadMetadata>(metadata?: T) => {
			if (!metadata) return metadata;
			return Object.fromEntries(
				Object.entries(metadata).map(([key, value]) => [
					key,
					typeof value === "string" ? value.replaceAll("{clientMessageId}", clientMessageId) : value,
				]),
			) as T;
		};
		const resolveMessagePatch = (patch?: Partial<ChatMessage>) =>
			patch
				? {
						...patch,
						thread: resolveThreadMetadata(patch.thread),
					}
				: patch;
		const userPatch = resolveMessagePatch(messagePatches.user);
		const agentPatch = resolveMessagePatch(messagePatches.agent);

		isSubmitting = true;

		const userMsgId = crypto.randomUUID();
		pendingReplyTargetId = userPatch?.thread?.commentId ?? null;

		messages = [
			...messages,
			{
				id: userMsgId,
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
			void handleCompleteAndNavigate(String(taskId ?? ""));
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

				messages = [...openingMessages];

				if (agentStartsFirst) {
					await scrollToBottom();
					const openingResult = await requestAgentFirstReplyAction(currentId);
					applySendResult(mapOpeningActionResult(openingResult), `join-${currentId}`);
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
		get replyingToId() {
			return pendingReplyTargetId;
		},
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
		get isInitializing() {
			return isInitializing;
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
		handleCompleteAndNavigate,
		handleRetry,
		runAutoCompleteIfNeeded,
		hydrateFromExistingSession,
		initializeFreshSession,
		scrollToBottom,
	};
}
