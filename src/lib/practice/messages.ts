import type { CommentThreadMetadata } from "./comment-thread";

/** One stored conversation message, as the session loader returns it. */
export type PersistedPracticeMessage = {
	id: number;
	role: string;
	content: string;
	createdAt: string | Date;
	llmMetadata?: unknown;
};

/** The learner's attempt as the session loader returns it. */
export type PersistedPracticeSession = {
	id: number;
	status: "in_progress" | "completed" | "evaluated" | "abandoned";
	agentReadUpToMessageId: number | null;
	/** Earliest outstanding agent work (composing or pacing out a burst); drives polling. */
	nextAgentWorkDueAt: string | Date | null;
	messages: PersistedPracticeMessage[];
};

/** Opening chat history (iMessage, Discord) authored with the task. */
/**
 * The real conversation a task is cut from (`lib/admin/capture.ts`). The opening shows what came
 * before the cut; `continuation` is how it really went on, the cast's background, never shown to
 * the learner.
 */
export type TaskSource = { continuation: string };

export type ChatOpeningState = {
	/** The counterpart's authored display name; overrides the opening senders. */
	counterpartName?: string;
	previousMessages?: Array<{ sender?: string; text?: string; timestamp?: string }>;
};

/**
 * A message as every practice surface renders it. Placeholders for replies that are still being
 * composed (`pending`) or failed carry state, never copy: each surface words them itself.
 */
export type ChatMessage = {
	id: string;
	role: "user" | "agent";
	text: string;
	/** Display time; empty for opening messages without an authored time. */
	timestamp: string;
	authorName: string;
	deliveryState?: "pending" | "failed";
	error?: string;
	clientMessageId?: string;
	retryText?: string;
	thread?: CommentThreadMetadata;
	/** The message a reply quotes, as a scene message ref (see `getCommentId`). */
	replyTo?: string;
};

type MessageMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	noReply?: boolean;
	failureError?: string | null;
	hidden?: boolean;
	displayContent?: string;
	assistantAuthorName?: string;
	replyTo?: string | null;
	thread?: CommentThreadMetadata;
	/** Arrival-based replies: the learner message whose conversation this delivery takes up (null for world moments). */
	inputMessageId?: number | null;
	/** Arrival-based surfaces: this message's wait settles within its own conversation, never the whole burst. */
	arrival?: boolean;
	/** Arrival-based replies: this message's wait belongs to the head it folded into. */
	foldedInto?: number;
};

function metadataOf(value: unknown): MessageMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as MessageMetadata;
}

function isAgentRole(role: string) {
	return role === "assistant" || role === "agent";
}

export function parsePersistedMessageDate(value: string | Date) {
	if (value instanceof Date) return value;
	const normalized = value.trim().replace(" ", "T");
	const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
	if (!hasTimeZone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(normalized)) {
		return new Date(`${normalized}Z`);
	}
	return new Date(normalized);
}

function sortChronologically<T extends Pick<PersistedPracticeMessage, "id" | "createdAt">>(messages: T[]): T[] {
	return messages
		.map((message, index) => ({ message, index, time: parsePersistedMessageDate(message.createdAt).getTime() }))
		.sort((a, b) => a.time - b.time || a.message.id - b.message.id || a.index - b.index)
		.map(({ message }) => message);
}

/**
 * A learner message's shared wait: its id plus every learner message folded into it, transitively.
 * Placeholders, submit and settlement must agree on it, so all of them read it from here.
 */
export function foldedChainIds(messages: Array<{ id: number; role: string; llmMetadata?: unknown }>, headId: number): Set<number> {
	const ids = new Set<number>([headId]);
	for (let grew = true; grew; ) {
		grew = false;
		for (const message of messages) {
			if (message.role !== "user" || ids.has(message.id)) continue;
			const foldedInto = metadataOf(message.llmMetadata).foldedInto;
			if (typeof foldedInto === "number" && ids.has(foldedInto)) {
				ids.add(message.id);
				grew = true;
			}
		}
	}
	return ids;
}

function hasAssistantReplyInSameTurn(messages: PersistedPracticeMessage[], userMessageIndex: number) {
	const userMessage = messages[userMessageIndex];
	if (!userMessage) return false;
	const clientMessageId = metadataOf(userMessage.llmMetadata).clientMessageId;
	if (
		clientMessageId &&
		messages.some((message) => isAgentRole(message.role) && metadataOf(message.llmMetadata).clientMessageId === clientMessageId)
	) {
		return true;
	}

	// Arrival-based deliveries name the learner message whose conversation they take up (world
	// moments name none): a reply resolves only that message's shared wait — itself and everything
	// folded into it — never the whole burst. The positional fold below covers live surfaces
	// and messages from before arrival-based replies.
	const waitIds = foldedChainIds(messages, userMessage.id);
	for (let index = userMessageIndex + 1; index < messages.length; index += 1) {
		const message = messages[index];
		if (!isAgentRole(message.role)) continue;
		const answered = metadataOf(message.llmMetadata).inputMessageId;
		if (typeof answered === "number" && waitIds.has(answered)) return true;
	}

	// An arrival-based message settles within its own conversation only: a later message's
	// silence or reply is another conversation's business, never this one's. Older messages keep
	// the fold below, whatever branch their answer landed in, or they would wait forever.
	if (metadataOf(userMessage.llmMetadata).arrival === true) return false;

	// A failed turn keeps its own retry affordance until retried: a later reply to
	// another turn must not clear it. Pending turns are async: the agent generates
	// from the full history, so one later reply answers every preceding unanswered
	// user message in the burst (fold), clearing all their placeholders at once.
	const failed = metadataOf(userMessage.llmMetadata).failed === true;
	for (let index = userMessageIndex + 1; index < messages.length; index += 1) {
		const message = messages[index];
		const metadata = metadataOf(message.llmMetadata);
		if (message.role === "user") {
			if (failed) return false;
			if (metadata.noReply === true) return true;
		}
		if (isAgentRole(message.role)) {
			if (clientMessageId && metadata.clientMessageId && metadata.clientMessageId !== clientMessageId) continue;
			return true;
		}
	}

	return false;
}

/** Where a reply placeholder sits on a comment thread: under the learner comment it waits on. */
export function placeholderThread(thread: CommentThreadMetadata | undefined): CommentThreadMetadata | undefined {
	return thread?.commentId ? { commentId: thread.commentId.replace("-user-", "-agent-"), parentCommentId: thread.commentId } : undefined;
}

/**
 * Persisted messages in conversation order, without hidden ones. A learner message that is still
 * waiting for (or failed to get) a reply is followed by a placeholder carrying that state.
 */
export function buildChatMessages({
	rawMessages,
	formatTimestamp,
	userName,
	agentName,
}: {
	rawMessages: PersistedPracticeMessage[];
	formatTimestamp: (date: Date) => string;
	userName: string;
	agentName: string;
}): ChatMessage[] {
	const sorted = sortChronologically(rawMessages);

	return sorted.flatMap((message, index): ChatMessage[] => {
		const metadata = metadataOf(message.llmMetadata);
		if (metadata.hidden === true) return [];
		const isUser = message.role === "user";
		const timestamp = formatTimestamp(parsePersistedMessageDate(message.createdAt));
		const responderName = metadata.assistantAuthorName ?? metadata.thread?.responderName ?? agentName;
		const mapped: ChatMessage = {
			id: String(message.id),
			role: isUser ? "user" : "agent",
			text: metadata.displayContent ?? message.content,
			timestamp,
			authorName: isUser ? userName : responderName,
			clientMessageId: metadata.clientMessageId,
			thread: metadata.thread,
			...(metadata.replyTo ? { replyTo: metadata.replyTo } : {}),
		};

		// A folded message's wait is its head's wait: no separate placeholder or retry affordance
		// of its own; the head's takers answer for the whole chain.
		if (
			!isUser ||
			!metadata.clientMessageId ||
			metadata.noReply === true ||
			typeof metadata.foldedInto === "number" ||
			hasAssistantReplyInSameTurn(sorted, index)
		) {
			return [mapped];
		}

		const failed = metadata.failed === true;
		const placeholder: ChatMessage = {
			id: `retry-${message.id}`,
			role: "agent",
			text: "",
			timestamp,
			authorName: responderName,
			deliveryState: failed ? "failed" : "pending",
			error: failed ? metadata.failureError || undefined : undefined,
			clientMessageId: metadata.clientMessageId,
			retryText: mapped.text,
			thread: placeholderThread(metadata.thread),
		};
		return [mapped, placeholder];
	});
}

/** Opening chat history as messages; the learner's own lines are recognised by name. */
export function buildOpeningMessages(openingState: ChatOpeningState, userName: string, agentName: string): ChatMessage[] {
	const history = Array.isArray(openingState.previousMessages) ? openingState.previousMessages : [];
	return history.flatMap((raw, index): ChatMessage[] => {
		const sender = raw.sender?.trim() ?? "";
		const text = raw.text?.trim() ?? "";
		if (!text) return [];
		const isUser = sender === userName;
		return [
			{
				id: `opening-${index}`,
				role: isUser ? "user" : "agent",
				text,
				timestamp: raw.timestamp?.trim() ?? "",
				authorName: sender || agentName,
			},
		];
	});
}

/** The counterpart's name in an opening chat history: its first sender that is not the learner. */
export function resolveOpeningAgentName(openingState: ChatOpeningState, userName: string): string | null {
	for (const message of Array.isArray(openingState.previousMessages) ? openingState.previousMessages : []) {
		const sender = message.sender?.trim();
		if (sender && sender !== userName) return sender;
	}
	return null;
}
