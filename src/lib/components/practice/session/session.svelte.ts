import { onMount, tick, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { goto, invalidate } from "$app/navigation";
import { PRACTICE_SESSION_DEPENDENCY } from "$lib/app/load-dependencies";
import { refreshTrialQuota } from "$lib/components/account/trial-quota";
import type { LanguageCode } from "$lib/constants";
import { planAgentWorkPolling } from "$lib/practice/agent-work-polling";
import type { CommentThreadMetadata } from "$lib/practice/comment-thread";
import {
	buildChatMessages,
	buildOpeningMessages,
	type ChatMessage,
	type ChatOpeningState,
	type PersistedPracticeSession,
	parsePersistedMessageDate,
	resolveOpeningAgentName,
} from "$lib/practice/messages";
import { getDeliveryDelayMs } from "$lib/practice/reply-timing";
import { getDisplayClock } from "$lib/time/display-clock";
import { createHintAssist } from "../hint/hint-assist.svelte";
import { actionError, postPageAction, type SendResult, sendMessage } from "./actions";
import { createTimeFormatter } from "./message-format";

/** What the session route passes to every practice surface. */
export type PracticeSurfaceProps = {
	taskId: string;
	userName: string;
	avatarUrl: string;
	language: LanguageCode;
	session: PersistedPracticeSession | null;
	openingState: unknown;
	maxTurns: number;
	/** Task details and the feedback page, pinned to the attempt the URL shows. */
	returnHref: string;
	feedbackHref: string;
};

export type PracticeSession = ReturnType<typeof createPracticeSession>;

export type SendOptions = {
	/** Extra form fields for the send action (e.g. the reply target). */
	fields?: Record<string, string>;
	/** Thread placement of the learner comment and of its reply, once the client id is known. */
	thread?: (clientMessageId: string) => { user: CommentThreadMetadata; agent: CommentThreadMetadata };
};

export const SESSION_POLL_INTERVAL_MS = 3_000;

function toTime(value: string | Date | null | undefined): number | null {
	if (!value) return null;
	const time = parsePersistedMessageDate(value).getTime();
	return Number.isNaN(time) ? null : time;
}

/**
 * The session lifecycle every practice surface shares: start, send, retry, paced delivery,
 * polling for agent work, and finishing. It knows nothing about names, colours or layout; the
 * surface supplies the counterpart's fallback name and renders the state.
 *
 * Server state is derived from props, so SSR and hydration render the same conversation. Local
 * state only overlays it: optimistic sends until the server snapshot contains them, failed
 * placeholders hidden while their retry is in flight, and agent messages held back for pacing.
 */
export function createPracticeSession(getProps: () => PracticeSurfaceProps, options: { fallbackAgentName: () => string }) {
	const clock = getDisplayClock();
	const props = $derived(getProps());
	const formatTimestamp = $derived(createTimeFormatter(clock().timeZone));
	const openingState = $derived((props.openingState ?? {}) as ChatOpeningState);
	const agentName = $derived(resolveOpeningAgentName(openingState, props.userName) ?? options.fallbackAgentName());

	let startedSessionId = $state<number | null>(null);
	let completedLocally = $state(false);
	let submitting = $state(false);
	let completing = $state(false);
	let initializing = $state(false);
	let confirmingFinish = $state(false);
	let autoFinished = false;
	let optimistic = $state<ChatMessage[]>([]);
	let retrying = $state<string[]>([]);
	let scroller = $state<HTMLElement | null>(null);

	const sessionId = $derived(props.session?.id ?? startedSessionId);
	const opening = $derived(buildOpeningMessages(openingState, props.userName, agentName));
	const persisted = $derived(
		props.session ? buildChatMessages({ rawMessages: props.session.messages, formatTimestamp, userName: props.userName, agentName }) : [],
	);
	const confirmed = $derived(
		new Set(persisted.flatMap((message) => (message.role === "user" && message.clientMessageId ? [message.clientMessageId] : []))),
	);
	const conversation = $derived([
		...persisted.filter((message) => !retrying.includes(message.id)),
		...optimistic.filter((message) => !message.clientMessageId || !confirmed.has(message.clientMessageId)),
	]);

	// Replies delivered before mount are history. Later ones are acknowledged one at a time: the
	// first shows at once, each next one after its own typing time.
	const isDelivered = (message: ChatMessage) => message.role === "agent" && !message.deliveryState;
	const acknowledged = new SvelteSet<string>(untrack(() => persisted.filter(isDelivered).map((message) => message.id)));
	const unrevealed = $derived(conversation.filter((message) => isDelivered(message) && !acknowledged.has(message.id)));
	const held = $derived(new Set(unrevealed.slice(1).map((message) => message.id)));
	const messages = $derived([...opening, ...(held.size ? conversation.filter((message) => !held.has(message.id)) : conversation)]);
	// Primitives, so a poll that rebuilds identical messages does not restart the pacing timer.
	const revealHeadId = $derived(unrevealed[0]?.id ?? null);
	const revealNextId = $derived(unrevealed[1]?.id ?? null);
	const revealNextText = $derived(unrevealed[1]?.text ?? "");

	const isCompleted = $derived(completedLocally || (props.session !== null && props.session.status !== "in_progress"));
	const currentTurns = $derived(conversation.filter((message) => message.role === "user").length);
	const limitReached = $derived(props.maxTurns > 0 && currentTurns >= props.maxTurns);
	const remainingTurns = $derived(props.maxTurns > 0 ? Math.max(0, props.maxTurns - currentTurns) : null);
	const isWaitingRetry = $derived(conversation.some((message) => message.deliveryState === "failed"));
	const replyPending = $derived(conversation.some((message) => message.deliveryState === "pending"));
	const agentWorkDueAt = $derived(toTime(props.session?.nextAgentWorkDueAt));
	const busy = $derived(submitting || completing || initializing);
	const disabled = $derived(busy || isCompleted || limitReached || sessionId === null || isWaitingRetry);
	const canFinish = $derived(sessionId !== null && currentTurns > 0 && !isCompleted && !busy);

	const hint = createHintAssist(() => sessionId);

	function refresh() {
		return invalidate(PRACTICE_SESSION_DEPENDENCY);
	}

	function acknowledgeAll() {
		for (const message of unrevealed) acknowledged.add(message.id);
	}

	async function navigateToFeedback() {
		completedLocally = true;
		await goto(props.feedbackHref);
	}

	/** Applies a send result; false when the server rejected the message outright. */
	async function settle(result: SendResult, placeholder: Omit<ChatMessage, "id" | "role" | "text" | "timestamp">): Promise<boolean> {
		if (result.status === "session_completed") {
			await navigateToFeedback();
			return true;
		}
		if (result.status === "rejected") return false;
		const { clientMessageId } = placeholder;
		optimistic = [
			...optimistic.filter((message) => !(message.role === "agent" && message.clientMessageId === clientMessageId)),
			{
				...placeholder,
				id: `local-reply-${clientMessageId}`,
				role: "agent",
				text: "",
				timestamp: formatTimestamp(new Date()),
				deliveryState: result.status,
				error: result.status === "failed" ? result.error : undefined,
			},
		];
		// Server truth replaces the optimistic copies as soon as it contains the learner message.
		await Promise.all([refresh(), refreshTrialQuota()]);
		return true;
	}

	/** Sends a learner message; resolves false when it was not accepted, so the draft can be restored. */
	async function send(text: string, sendOptions: SendOptions = {}): Promise<boolean> {
		const body = text.replace(/\r\n?/g, "\n").trim();
		if (!body || disabled || sessionId === null) return false;
		// The learner's message must land after the whole agent burst.
		acknowledgeAll();
		const clientMessageId = crypto.randomUUID();
		const thread = sendOptions.thread?.(clientMessageId);
		optimistic = [
			...optimistic,
			{
				id: `local-${clientMessageId}`,
				role: "user",
				text: body,
				timestamp: formatTimestamp(new Date()),
				authorName: props.userName,
				clientMessageId,
				thread: thread?.user,
			},
		];
		submitting = true;
		try {
			const result = await sendMessage(sessionId, body, clientMessageId, sendOptions.fields);
			const accepted = await settle(result, {
				authorName: thread?.agent.responderName ?? agentName,
				clientMessageId,
				retryText: body,
				thread: thread?.agent,
			});
			if (!accepted) optimistic = optimistic.filter((message) => message.clientMessageId !== clientMessageId);
			return accepted;
		} finally {
			submitting = false;
		}
	}

	async function retry(messageId: string) {
		const failed = conversation.find((message) => message.id === messageId && message.deliveryState === "failed");
		if (!failed?.clientMessageId || sessionId === null || busy || isCompleted) return;
		acknowledgeAll();
		const original = conversation.find((message) => message.role === "user" && message.clientMessageId === failed.clientMessageId);
		const target = original?.thread?.targetCommentId;
		retrying = [...retrying, messageId];
		optimistic = optimistic.filter((message) => message.id !== messageId);
		submitting = true;
		try {
			const result = await sendMessage(sessionId, failed.retryText ?? "", failed.clientMessageId, target ? { threadTargetCommentId: target } : {});
			await settle(result, {
				authorName: failed.authorName,
				clientMessageId: failed.clientMessageId,
				retryText: failed.retryText,
				thread: failed.thread,
			});
		} finally {
			retrying = retrying.filter((id) => id !== messageId);
			submitting = false;
		}
	}

	async function finish() {
		if (sessionId === null || completing || isCompleted) return;
		confirmingFinish = false;
		completing = true;
		try {
			const result = await postPageAction("complete", { sessionId });
			// A session the send already completed is still a finished session.
			if (result.type === "success" || actionError(result)?.includes("Session not in progress")) await navigateToFeedback();
			else console.error("Completion failed:", result);
		} catch (error) {
			console.error("Completion failed:", error);
		} finally {
			completing = false;
		}
	}

	async function start() {
		initializing = true;
		try {
			const result = await postPageAction("start");
			if (result.type === "success" && typeof result.data?.sessionId === "number") {
				startedSessionId = result.data.sessionId;
				await Promise.all([refresh(), refreshTrialQuota()]);
			} else {
				console.error("Session start was rejected:", result);
			}
		} catch (error) {
			console.error("Session start failed:", error);
		} finally {
			initializing = false;
		}
	}

	$effect(() => {
		const head = revealHeadId;
		if (!head) return;
		if (!revealNextId) {
			acknowledged.add(head);
			return;
		}
		const timer = setTimeout(() => acknowledged.add(head), getDeliveryDelayMs(untrack(() => revealNextText)));
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (limitReached && !isWaitingRetry && !busy && !isCompleted && sessionId !== null && !autoFinished) {
			autoFinished = true;
			void finish();
		}
	});

	$effect(() => {
		if (sessionId === null || isCompleted) return;
		const plan = planAgentWorkPolling({
			hasPendingPlaceholder: replyPending,
			agentWorkDueAt: agentWorkDueAt === null ? null : new Date(agentWorkDueAt),
			now: new Date(),
		});
		if (plan.kind === "none") return;
		if (plan.kind === "interval") {
			if (submitting) return;
			const interval = setInterval(() => void refresh(), SESSION_POLL_INTERVAL_MS);
			return () => clearInterval(interval);
		}
		// Far-future work (e.g. an idle follow-up): one wake-up instead of polling the whole window.
		const timer = setTimeout(() => void refresh(), plan.delayMs);
		return () => clearTimeout(timer);
	});

	// The worker spends the trial balance while composing; re-read it once the work settles
	// rather than on every poll, which would reload the whole app layout every few seconds.
	let agentWorkWasOutstanding = false;
	$effect(() => {
		const outstanding = agentWorkDueAt !== null || replyPending;
		if (agentWorkWasOutstanding && !outstanding) void refreshTrialQuota();
		agentWorkWasOutstanding = outstanding;
	});

	$effect(() => {
		messages.length;
		if (!scroller) return;
		const element = scroller;
		void tick().then(() => {
			element.scrollTop = element.scrollHeight;
		});
	});

	onMount(() => {
		if (!untrack(() => props.session)) void start();
	});

	return {
		get sessionId() {
			return sessionId;
		},
		/** Opening history followed by the conversation, minus replies still held for pacing. */
		get messages() {
			return messages;
		},
		get agentName() {
			return agentName;
		},
		get agentReadUpToMessageId() {
			return props.session?.agentReadUpToMessageId ?? null;
		},
		get isSubmitting() {
			return submitting;
		},
		get isCompleting() {
			return completing;
		},
		get isInitializing() {
			return initializing;
		},
		get isCompleted() {
			return isCompleted;
		},
		get isWaitingRetry() {
			return isWaitingRetry;
		},
		/** The agent is (or is about to be) composing a reply to the learner. */
		get isTyping() {
			return (initializing || submitting || replyPending) && !isWaitingRetry;
		},
		get hasPendingReveals() {
			return held.size > 0;
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
		/** Composers are locked while anything is in flight, after completion, or at the turn limit. */
		get disabled() {
			return disabled;
		},
		get canFinish() {
			return canFinish;
		},
		get confirmingFinish() {
			return confirmingFinish;
		},
		/** The element the surface scrolls to its newest message; unset for surfaces that do not. */
		set scroller(element: HTMLElement | null) {
			scroller = element;
		},
		get scroller() {
			return scroller;
		},
		hint,
		send,
		retry,
		finish,
		requestFinish() {
			if (canFinish) confirmingFinish = true;
		},
		cancelFinish() {
			confirmingFinish = false;
		},
	};
}
