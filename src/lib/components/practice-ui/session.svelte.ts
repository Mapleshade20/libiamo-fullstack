import { onMount, tick } from "svelte";
import { invalidate } from "$app/navigation";
import { getDeliveryDelayMs } from "$lib/agent-replies/timing";
import { getDisplayClock } from "$lib/display-clock";
import { PRACTICE_SESSION_DEPENDENCY, TRIAL_QUOTA_DEPENDENCY } from "$lib/load-dependencies";
import { prepareMarkdownText } from "../utils/markdownUtils";
import { createTimeFormatter } from "../utils/messageUtils";
import { calculateCurrentTurns, isTurnLimitReached } from "../utils/sessionUtils";
import { completeAction, postAction } from "./apiService";
import { type MessageSubmissionResult, submitPracticeMessage } from "./chatFlowController";
import { buildChatMessages, type ChatMessage, getSessionSnapshot, parsePersistedMessageDate, updateMessageById } from "./chatMessages";
import type { CommentThreadMetadata } from "./commentThread";
import type { PracticeOpeningState, PracticePresentation, PracticePresentationAdapter, PracticeSendOutcome, PracticeSessionSnapshot } from "./types";

export interface PracticeSessionLabels {
	stillProcessingMessage: string;
	retryFailedMessage: string;
	earlier: string;
}

export const SESSION_POLL_INTERVAL_MS = 3_000;
/** Outstanding agent work due within this horizon keeps the client polling. */
export const AGENT_WORK_DUE_SOON_MS = 30_000;
/** Wake slightly after the due time so the worker has claimed the batch first. */
export const AGENT_WORK_WAKE_BUFFER_MS = 2_000;

export type AgentWorkPollingPlan = { kind: "interval" } | { kind: "wake"; delayMs: number } | { kind: "none" };

export interface PracticeSessionOptions<Opening = PracticeOpeningState, Context = undefined> {
	userName: string;
	avatarUrl: string;
	language: string;
	existingSession: PracticeSessionSnapshot | null;
	openingState: unknown;
	maxTurns: number;
	labels: PracticeSessionLabels;
	adapter: PracticePresentationAdapter<Opening, Context>;
	taskId?: string | number;
}

/**
 * How the client watches for outstanding agent work (a batch still composing or
 * pacing out its deliveries): poll continuously while a reply placeholder is up
 * or work falls due within the horizon, otherwise wake once when the next work
 * item is due — and stop when nothing is outstanding.
 */
export function planAgentWorkPolling(input: { hasPendingPlaceholder: boolean; agentWorkDueAt: Date | null; now: Date }): AgentWorkPollingPlan {
	const dueAt = input.agentWorkDueAt?.getTime() ?? null;
	if (input.hasPendingPlaceholder || (dueAt !== null && dueAt <= input.now.getTime() + AGENT_WORK_DUE_SOON_MS)) {
		return { kind: "interval" };
	}
	if (dueAt !== null) {
		return { kind: "wake", delayMs: Math.max(0, dueAt + AGENT_WORK_WAKE_BUFFER_MS - input.now.getTime()) };
	}
	return { kind: "none" };
}

function toAgentWorkDueAt(value: unknown): Date | null {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value === "string" && value.trim()) {
		const parsed = parsePersistedMessageDate(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	return null;
}

export function createPracticeSession<Opening, Context>(getOptions: () => PracticeSessionOptions<Opening, Context>) {
	const clock = getDisplayClock();
	// Use $derived to keep values reactive after targeted invalidation re-runs getOptions().
	// One-time destructuring would capture stale values and never update.
	const userName = $derived(getOptions().userName);
	const avatarUrl = $derived(getOptions().avatarUrl);
	const existingSession = $derived(getOptions().existingSession);
	const openingState = $derived(getOptions().openingState);
	const maxTurns = $derived(getOptions().maxTurns);
	const labels = $derived(getOptions().labels);
	const adapter = getOptions().adapter;
	const taskId = $derived(getOptions().taskId);

	const openingStateData = $derived(adapter.normalizeOpeningState(openingState));
	const formatTimestamp = $derived(createTimeFormatter(clock().timeZone));

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
	let refreshPromise: Promise<unknown> | null = null;
	let messages = $state<ChatMessage[]>([]);
	let pendingReplyTargetId = $state<string | null>(null);
	let agentReadUpToMessageId = $state<number | null>(null);
	let presentation = $state.raw<PracticePresentation<Context>>(
		adapter.resolvePresentation({
			sessionId: null,
			openingState: adapter.normalizeOpeningState(getOptions().openingState),
			userName: getOptions().userName,
		}),
	);

	let inputText = $state("");
	let chatContainer = $state<HTMLElement | null>(null);

	// ── Staggered reveal ──────────────────────────────────────────
	/** Agent messages that arrived in one poll and wait for their typing turn. */
	let revealQueue = $state<ChatMessage[]>([]);
	let revealTimer: ReturnType<typeof setTimeout> | undefined;
	/** Full hydrated list from the last snapshot (opening + session messages). */
	let lastHydratedMessages: ChatMessage[] = [];
	/** Session messages from the last hydration; the diff base for new deliveries. */
	let lastSessionMessages: ChatMessage[] = [];

	// ── Derived ────────────────────────────────────────────────────

	const agentName = $derived(presentation.agent.name);
	const isWaitingRetry = $derived(messages.some((m) => m.deliveryState === "failed" && !m.isHidden));
	const isAnyMessagePending = $derived(messages.some((m) => m.deliveryState === "pending" && !m.isHidden));
	const isTyping = $derived((isInitializing || isSubmitting || isAnyMessagePending) && !isWaitingRetry);
	const currentTurns = $derived(calculateCurrentTurns(messages));
	const limitReached = $derived(isTurnLimitReached(currentTurns, maxTurns ?? 0));
	const remainingTurns = $derived(maxTurns > 0 ? Math.max(0, maxTurns - currentTurns) : null);
	const disabled = $derived(isSubmitting || isCompleting || isCompleted || isInitializing || limitReached || !sessionId || isWaitingRetry);
	const nextAgentWorkDueAt = $derived(toAgentWorkDueAt((existingSession as { nextAgentWorkDueAt?: unknown } | null)?.nextAgentWorkDueAt));

	// ── Staggered reveal ──────────────────────────────────────────

	/** Messages currently displayed: the last hydrated list minus paced-out entries. */
	function displayedMessages(): ChatMessage[] {
		if (revealQueue.length === 0) return [...lastHydratedMessages];
		const paced = new Set(revealQueue.map((message) => message.id));
		return lastHydratedMessages.filter((message) => !paced.has(message.id));
	}

	function scheduleNextReveal() {
		if (revealTimer !== undefined || revealQueue.length === 0) return;
		const next = revealQueue[0];
		if (!next) return;
		// The wait before a paced message appears scales with its own length,
		// mirroring the worker's typing-based delivery pacing.
		revealTimer = setTimeout(() => {
			revealTimer = undefined;
			revealQueue = revealQueue.slice(1);
			messages = displayedMessages();
			void scrollToBottom();
			scheduleNextReveal();
		}, getDeliveryDelayMs(next.text));
	}

	function clearReveal() {
		if (revealTimer !== undefined) {
			clearTimeout(revealTimer);
			revealTimer = undefined;
		}
		revealQueue = [];
	}

	/**
	 * Queues newly delivered agent messages for paced reveal: the first lands
	 * immediately (it is already overdue), the rest replay one at a time so a
	 * coalesced poll burst still reads as live typing.
	 */
	function applyStaggeredReveal(sessionMessages: ChatMessage[]) {
		const known = new Set([...lastSessionMessages.map((message) => message.id), ...revealQueue.map((message) => message.id)]);
		const fresh = sessionMessages.filter(
			(message) => message.role === "agent" && message.deliveryState === undefined && !message.isHidden && !known.has(message.id),
		);
		lastSessionMessages = sessionMessages;
		if (fresh.length === 0) return;
		revealQueue = revealQueue.length === 0 ? fresh.slice(1) : [...revealQueue, ...fresh];
		scheduleNextReveal();
	}

	/** Shows paced-out messages at once, e.g. before appending a new user message. */
	function flushRevealQueue() {
		if (revealQueue.length === 0 && revealTimer === undefined) return;
		clearReveal();
		messages = [...lastHydratedMessages];
		void scrollToBottom();
	}

	// ── Agent message helpers ──────────────────────────────────────
	function presentMessage(message: ChatMessage): ChatMessage {
		return { ...message, ...adapter.messagePatch?.(message) };
	}

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
			presentMessage({
				id: crypto.randomUUID(),
				role: "agent",
				text: params.text,
				timestamp: formatTimestamp(new Date()),
				authorName: agentName,
				avatar: presentation.agent.avatarUrl,
				avatarColor: presentation.agent.accentClass,
				deliveryState: params.deliveryState,
				clientMessageId: params.clientMessageId,
				retryText: params.retryText,
				...params.messagePatch,
			}),
		];
	}

	function applySendResult(result: MessageSubmissionResult, clientMessageId: string, retryText?: string, agentMessagePatch?: Partial<ChatMessage>) {
		if (result.status === "session_completed") {
			// The server already finished the session in the send transaction; navigate without calling complete.
			finishAndNavigateToFeedback(String(taskId ?? ""));
		} else if (result.status === "pending") {
			addAgentMessage({ text: labels.stillProcessingMessage, deliveryState: "pending", clientMessageId, messagePatch: agentMessagePatch });
		} else if (result.status === "failed") {
			addAgentMessage({
				text: result.error ?? labels.retryFailedMessage,
				deliveryState: "failed",
				clientMessageId,
				retryText,
				messagePatch: agentMessagePatch,
			});
		} else if (result.status === "rejected") {
			console.warn("Backend rejected the message");
		}
	}

	function actionErrorMessage(result: unknown): string | undefined {
		if (!result || typeof result !== "object") return undefined;
		const data = (result as { data?: unknown }).data;
		if (!data || typeof data !== "object") return undefined;
		const error = (data as { error?: unknown }).error;
		return typeof error === "string" && error.trim() ? error : undefined;
	}

	// ── Actions ────────────────────────────────────────────────────

	function refreshTrialQuota() {
		return invalidate(TRIAL_QUOTA_DEPENDENCY);
	}

	function refreshPracticeSession() {
		if (refreshPromise) return refreshPromise;
		refreshPromise = Promise.resolve(invalidate(PRACTICE_SESSION_DEPENDENCY)).finally(() => {
			refreshPromise = null;
		});
		return refreshPromise;
	}

	function refreshAfterSendResult(result: MessageSubmissionResult) {
		if (result.status === "pending") {
			return Promise.all([refreshPracticeSession(), refreshTrialQuota()]);
		}
		return refreshTrialQuota();
	}

	async function scrollToBottom() {
		await tick();
		if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
	}

	async function handleRetry(messageId: string) {
		if (isSubmitting || isCompleted || isInitializing || !sessionId) return;

		flushRevealQueue();

		const message = messages.find((m) => m.id === messageId);
		if (!message?.clientMessageId) return;

		messages = updateMessageById(messages, messageId, (m) => ({ ...m, isHidden: true }));
		await scrollToBottom();

		isSubmitting = true;

		const retryText = message.retryText || message.text;
		const originalUserMessage = messages.find((m) => m.role === "user" && m.clientMessageId === message.clientMessageId);
		const retryExtraFields = adapter.retryFields?.(originalUserMessage) ?? {};
		try {
			const result = await submitPracticeMessage({
				sessionId,
				message: retryText,
				clientMessageId: message.clientMessageId,
				extraFields: retryExtraFields,
			});
			applySendResult(result, message.clientMessageId, retryText, {
				authorName: message.authorName,
				thread: message.thread,
			});
			await scrollToBottom();
			await refreshAfterSendResult(result);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleCompleteAndNavigate(taskId: string) {
		if (!sessionId || isCompleting || isCompleted) return;
		isCompleting = true;
		try {
			const result = await completeAction(sessionId);

			if (result.type === "success") {
				finishAndNavigateToFeedback(taskId);
			} else {
				// A completed session (e.g. finished by the send itself) is still a success for navigation purposes.
				const error = actionErrorMessage(result) ?? "";
				if (error.includes("Session not in progress")) {
					finishAndNavigateToFeedback(taskId);
				} else {
					console.error("Completion failed:", error || result);
				}
			}
		} catch (error) {
			console.error("Completion failed:", error);
		} finally {
			isCompleting = false;
		}
	}

	function finishAndNavigateToFeedback(taskId: string) {
		isCompleted = true;
		adapter.beforeFeedbackNavigation?.();
		window.location.href = `/task/${taskId}/feedback`;
	}

	async function handleSend(request: {
		message: string;
		extraFields?: Record<string, string>;
		messagePatches?: { user?: Partial<ChatMessage>; agent?: Partial<ChatMessage> };
	}): Promise<PracticeSendOutcome> {
		const { message: text, extraFields = {}, messagePatches = {} } = request;
		if (!text.trim() || disabled) return { status: "rejected", clientMessageId: null, optimisticMessageId: null };

		// The optimistic user message must land after the full agent burst, so any
		// paced-out messages are revealed first.
		flushRevealQueue();

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
			presentMessage({
				id: userMsgId,
				role: "user",
				text: currentText,
				timestamp: formatTimestamp(new Date()),
				authorName: userName,
				avatar: avatarUrl,
				clientMessageId,
				...userPatch,
			}),
		];
		await scrollToBottom();

		let result: MessageSubmissionResult;
		try {
			result = await submitPracticeMessage({
				sessionId: sessionId as number,
				message: currentText,
				clientMessageId,
				extraFields: resolvedExtraFields,
			});
			applySendResult(result, clientMessageId, currentText, agentPatch);
			await scrollToBottom();
			await refreshAfterSendResult(result);
			return { status: result.status, clientMessageId, optimisticMessageId: userMsgId };
		} finally {
			isSubmitting = false;
		}
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
			const isNewSession = currentId !== lastLoadedSessionId;
			lastLoadedSessionId = currentId;
			lastSessionSnapshot = sessionSnapshot;
			sessionId = currentId;

			presentation = adapter.resolvePresentation({ sessionId: currentId, openingState: openingStateData, userName });

			isCompleted = sessionData.status === "completed" || sessionData.status === "evaluated" || sessionData.status === "abandoned";

			const openingMessages = adapter.buildOpeningMessages({
				openingState: openingStateData,
				presentation,
				userName,
				avatarUrl,
				earlier: labels.earlier,
			});

			const sessionMessages = buildChatMessages({
				rawMessages: sessionData.messages ?? [],
				formatTimestamp,
				userName,
				agentName: agentName,
				avatarUrl,
				agentColor: presentation.agent.accentClass,
				agentAvatarUrl: presentation.agent.avatarUrl,
				labels,
			}).map(presentMessage);

			lastHydratedMessages = [...openingMessages, ...sessionMessages];
			if (isNewSession) {
				// First load shows the full history at once; pacing applies only to
				// messages that arrive while the learner is watching.
				clearReveal();
				lastSessionMessages = sessionMessages;
				messages = [...lastHydratedMessages];
			} else {
				applyStaggeredReveal(sessionMessages);
				messages = displayedMessages();
			}

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

				presentation = adapter.resolvePresentation({ sessionId: currentId, openingState: openingStateData, userName });

				const openingMessages = adapter.buildOpeningMessages({
					openingState: openingStateData,
					presentation,
					userName,
					avatarUrl,
					earlier: labels.earlier,
				});

				messages = [...openingMessages];
				lastSessionMessages = [];
				lastHydratedMessages = [...openingMessages];

				await scrollToBottom();
				await refreshTrialQuota();
			}
		} catch (error) {
			console.error("Initialization failed:", error);
		} finally {
			isInitializing = false;
		}
	}

	// Build server-known messages during component creation so SSR and the first
	// hydrated DOM contain the same opening and persisted history.
	const initialExistingSession = getOptions().existingSession;
	if (initialExistingSession) hydrateFromExistingSession(initialExistingSession);

	// ── Effects ────────────────────────────────────────────────────

	$effect(() => {
		runAutoCompleteIfNeeded();
	});

	$effect(() => {
		if (existingSession) {
			// Read-receipt watermark updates on every poll; unlike hydrateFromExistingSession
			// it must not be gated by the message snapshot (claiming a batch changes no messages).
			agentReadUpToMessageId =
				typeof (existingSession as { agentReadUpToMessageId?: unknown }).agentReadUpToMessageId === "number"
					? (existingSession as { agentReadUpToMessageId: number }).agentReadUpToMessageId
					: null;
			hydrateFromExistingSession(existingSession);
		}
	});

	$effect(() => {
		const hasPendingPlaceholder = messages.some((m) => m.deliveryState === "pending" && !m.isHidden);
		const plan = planAgentWorkPolling({ hasPendingPlaceholder, agentWorkDueAt: nextAgentWorkDueAt, now: new Date() });
		if (plan.kind === "none" || !sessionId || isCompleted) return;
		if (plan.kind === "interval") {
			if (isSubmitting) return;
			const interval = setInterval(() => {
				void refreshPracticeSession();
				void refreshTrialQuota();
			}, SESSION_POLL_INTERVAL_MS);
			return () => clearInterval(interval);
		}
		// Far-future work (e.g. an idle follow-up): one wake-up at due time instead
		// of polling the whole window.
		const timer = setTimeout(() => {
			void refreshPracticeSession();
			void refreshTrialQuota();
		}, plan.delayMs);
		return () => clearTimeout(timer);
	});

	onMount(() => {
		const enterTimeout = setTimeout(() => {
			isEntering = false;
		}, 300);

		void initializeFreshSession();

		return () => {
			clearTimeout(enterTimeout);
			if (revealTimer !== undefined) clearTimeout(revealTimer);
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
		get agentPresentation() {
			return presentation.agent;
		},
		get presentationContext() {
			return presentation.context;
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
		get hasPendingReveals() {
			return revealQueue.length > 0;
		},
		get agentReadUpToMessageId() {
			return agentReadUpToMessageId;
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
