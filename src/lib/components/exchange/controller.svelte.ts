import { onMount, tick, untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { planAgentWorkPolling } from "#lib/exchange/agent-work-polling.ts";
import type { CommentThreadMetadata } from "#lib/exchange/comment-thread.ts";
import {
	buildChatMessages,
	buildOpeningMessages,
	type ChatMessage,
	type ChatOpeningState,
	type PersistedExchange,
	parsePersistedMessageDate,
	placeholderThread,
} from "#lib/exchange/messages.ts";
import { getDeliveryDelayMs } from "#lib/exchange/reply-timing.ts";
import { clock } from "#lib/time/clock.svelte.ts";
import { goto } from "$app/navigation";
import type { ExchangeApi, SendRejection, SendResult } from "./actions.ts";
import { createHintAssist } from "./hint/hint-assist.svelte.ts";
import { createTimeFormatter } from "./message-format.ts";

/** What the play page passes to every place. `scenarioId` seeds the names code draws. */
export type SurfaceProps = {
	scenarioId: string;
	userName: string;
	avatarUrl: string;
	language: string;
	persisted: PersistedExchange | null;
	openingState: unknown;
	maxTurns: number;
	/** The scenario's page, and where the learner goes once the exchange is over. */
	returnHref: string;
	afterHref: string;
	api: ExchangeApi;
};

export type ExchangeController = ReturnType<typeof createExchange>;

export type SendOptions = {
	/** Extra form fields for the send action (e.g. the reply target). */
	fields?: Record<string, string>;
	/** Thread placement of the learner comment, once the client id is known. */
	thread?: (clientMessageId: string) => CommentThreadMetadata;
	/** The scene message a chat reply quotes (see `getSceneMessageRef`). */
	replyTo?: string;
};

export const SESSION_POLL_INTERVAL_MS = 3_000;

function toTime(value: string | Date | null | undefined): number | null {
	if (!value) return null;
	const time = parsePersistedMessageDate(value).getTime();
	return Number.isNaN(time) ? null : time;
}

/**
 * The exchange lifecycle every practice surface shares: start, send, retry, paced delivery,
 * polling for agent work, and finishing. It knows nothing about names, colours or layout; the
 * surface supplies the counterpart's name (see `lib/practice/scene.ts`) and renders the state.
 *
 * Server state is derived from props, so SSR and hydration render the same conversation. Local
 * state only overlays it: optimistic sends until the server snapshot contains them, failed
 * placeholders hidden while their retry is in flight, and agent messages held back for pacing.
 */
export function createExchange(getProps: () => SurfaceProps, options: { agentName: () => string }) {
	const props = $derived(getProps());
	const formatTimestamp = $derived(createTimeFormatter(clock.timeZone));
	const openingState = $derived((props.openingState ?? {}) as ChatOpeningState);
	const agentName = $derived(options.agentName());

	let startedExchangeId = $state<number | null>(null);
	let completedLocally = $state(false);
	let submitting = $state(false);
	let completing = $state(false);
	let initializing = $state(false);
	let confirmingFinish = $state(false);
	let rejection = $state<{ reason: SendRejection; key: number } | null>(null);
	let autoFinished = false;
	let optimistic = $state<ChatMessage[]>([]);
	let retrying = $state<string[]>([]);
	let scroller = $state<HTMLElement | null>(null);

	const exchangeId = $derived(props.persisted?.id ?? startedExchangeId);
	const opening = $derived(buildOpeningMessages(openingState, props.userName, agentName));
	const persisted = $derived(
		props.persisted ? buildChatMessages({ rawMessages: props.persisted.messages, formatTimestamp, userName: props.userName, agentName }) : [],
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

	const isCompleted = $derived(completedLocally || (props.persisted !== null && props.persisted.status !== "in_progress"));
	const currentTurns = $derived(conversation.filter((message) => message.role === "user").length);
	const limitReached = $derived(props.maxTurns > 0 && currentTurns >= props.maxTurns);
	const remainingTurns = $derived(props.maxTurns > 0 ? Math.max(0, props.maxTurns - currentTurns) : null);
	const isWaitingRetry = $derived(conversation.some((message) => message.deliveryState === "failed"));
	const replyPending = $derived(conversation.some((message) => message.deliveryState === "pending"));
	const agentWorkDueAt = $derived(toTime(props.persisted?.nextAgentWorkDueAt));
	const busy = $derived(submitting || completing || initializing);
	const disabled = $derived(busy || isCompleted || limitReached || exchangeId === null || isWaitingRetry);
	const canFinish = $derived(exchangeId !== null && currentTurns > 0 && !isCompleted && !busy);

	const hint = createHintAssist(
		() => exchangeId,
		() => props.api,
	);

	function refresh() {
		return props.api.refresh();
	}

	function acknowledgeAll() {
		for (const message of unrevealed) acknowledged.add(message.id);
	}

	async function leave() {
		completedLocally = true;
		await goto(props.afterHref);
	}

	/** Applies a send result; false when the server rejected the message outright. */
	async function settle(result: SendResult, placeholder: Omit<ChatMessage, "id" | "role" | "text" | "timestamp">): Promise<boolean> {
		if (result.status === "exchange_completed") {
			await leave();
			return true;
		}
		if (result.status === "rejected") {
			rejection = { reason: result.reason, key: (rejection?.key ?? 0) + 1 };
			// A refusal can mean the exchange moved on elsewhere (finished in another tab): re-read it.
			void refresh();
			return false;
		}
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
			},
		];
		// Server truth replaces the optimistic copies as soon as it contains the learner message.
		await refresh();
		return true;
	}

	/** Sends a learner message; resolves false when it was not accepted, so the draft can be restored. */
	async function send(text: string, sendOptions: SendOptions = {}): Promise<boolean> {
		const body = text.replace(/\r\n?/g, "\n").trim();
		if (!body || disabled || exchangeId === null) return false;
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
				thread,
				...(sendOptions.replyTo ? { replyTo: sendOptions.replyTo } : {}),
			},
		];
		submitting = true;
		try {
			const fields = sendOptions.replyTo ? { ...sendOptions.fields, replyTo: sendOptions.replyTo } : sendOptions.fields;
			const result = await props.api.send({ ...fields, message: body, clientMessageId });
			const accepted = await settle(result, {
				authorName: agentName,
				clientMessageId,
				retryText: body,
				thread: placeholderThread(thread),
			});
			if (!accepted) optimistic = optimistic.filter((message) => message.clientMessageId !== clientMessageId);
			return accepted;
		} finally {
			submitting = false;
		}
	}

	async function retry(messageId: string) {
		const failed = conversation.find((message) => message.id === messageId && message.deliveryState === "failed");
		if (!failed?.clientMessageId || exchangeId === null || busy || isCompleted) return;
		acknowledgeAll();
		const original = conversation.find((message) => message.role === "user" && message.clientMessageId === failed.clientMessageId);
		const target = original?.thread?.targetCommentId;
		const fields = { ...(target ? { threadTargetCommentId: target } : {}), ...(original?.replyTo ? { replyTo: original.replyTo } : {}) };
		retrying = [...retrying, messageId];
		optimistic = optimistic.filter((message) => message.id !== messageId);
		submitting = true;
		try {
			const result = await props.api.send({ ...fields, message: failed.retryText ?? "", clientMessageId: failed.clientMessageId });
			const accepted = await settle(result, {
				authorName: failed.authorName,
				clientMessageId: failed.clientMessageId,
				retryText: failed.retryText,
				thread: failed.thread,
			});
			// Refused for good: resending would be refused again, so the local copy goes.
			if (!accepted) optimistic = optimistic.filter((message) => message.clientMessageId !== failed.clientMessageId);
		} finally {
			retrying = retrying.filter((id) => id !== messageId);
			submitting = false;
		}
	}

	async function finish() {
		if (exchangeId === null || completing || isCompleted) return;
		confirmingFinish = false;
		completing = true;
		try {
			await props.api.finish();
			await leave();
		} catch (error) {
			console.error("Completion failed:", error);
		} finally {
			completing = false;
		}
	}

	async function start() {
		initializing = true;
		try {
			await props.api.start();
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
		if (limitReached && !isWaitingRetry && !busy && !isCompleted && exchangeId !== null && !autoFinished) {
			autoFinished = true;
			void finish();
		}
	});

	// Bumped when a wake-up fires: work that fell due is usually still composing then, with the same
	// due time, so the plan must be re-read at the new "now" or polling would stop there.
	let wakes = $state(0);
	// A tab out of sight does not poll; back in sight, it asks at once what came meanwhile.
	let visible = $state(true);
	onMount(() => {
		const seen = () => {
			visible = document.visibilityState === "visible";
			if (visible && exchangeId !== null && !isCompleted) void refresh();
		};
		visible = document.visibilityState === "visible";
		document.addEventListener("visibilitychange", seen);
		return () => document.removeEventListener("visibilitychange", seen);
	});

	$effect(() => {
		void wakes;
		if (exchangeId === null || isCompleted) return;
		const plan = planAgentWorkPolling({
			hasPendingPlaceholder: replyPending,
			agentWorkDueAt: agentWorkDueAt === null ? null : new Date(agentWorkDueAt),
			now: new Date(),
		});
		if (plan.kind === "none") return;
		if (plan.kind === "interval") {
			if (submitting || !visible) return;
			const interval = setInterval(() => void refresh(), SESSION_POLL_INTERVAL_MS);
			return () => clearInterval(interval);
		}
		// Far-future work (e.g. an idle follow-up): one wake-up instead of polling the whole window.
		const timer = setTimeout(() => {
			wakes += 1;
			void refresh();
		}, plan.delayMs);
		return () => clearTimeout(timer);
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
		if (!untrack(() => props.persisted)) void start();
	});

	return {
		get exchangeId() {
			return exchangeId;
		},
		/** Opening history followed by the conversation, minus replies still held for pacing. */
		get messages() {
			return messages;
		},
		get agentName() {
			return agentName;
		},
		/** Who the typing indicator names: the author of the next paced reply, else the counterpart. */
		get typingName() {
			return unrevealed[1]?.authorName ?? agentName;
		},
		get agentReadUpToMessageId() {
			return props.persisted?.agentReadUpToMessageId ?? null;
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
		/** Why the server last refused a message outright; `key` changes on every refusal. */
		get rejection() {
			return rejection;
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
