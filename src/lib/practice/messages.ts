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
export type ChatOpeningState = {
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
};

type MessageMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	noReply?: boolean;
	failureError?: string | null;
	hidden?: boolean;
	displayContent?: string;
	assistantAuthorName?: string;
	thread?: CommentThreadMetadata;
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

function placeholderCommentId(userCommentId: string | undefined, clientMessageId: string, persistedMessageId: number): string {
	if (userCommentId?.includes("-user-")) return userCommentId.replace("-user-", "-agent-");
	return `thread-agent-${clientMessageId || persistedMessageId}`;
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
		};

		if (!isUser || !metadata.clientMessageId || metadata.noReply === true || hasAssistantReplyInSameTurn(sorted, index)) {
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
			thread: metadata.thread && {
				...metadata.thread,
				commentId: placeholderCommentId(metadata.thread.commentId, metadata.clientMessageId, message.id),
				parentCommentId: metadata.thread.commentId,
			},
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
