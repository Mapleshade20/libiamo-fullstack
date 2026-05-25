import type { CommentThreadMetadata } from "./commentThread";

type PersistedSessionMessage = {
	id: number | string;
	role: string;
	content: string;
	createdAt: string | Date;
	llmMetadata?: unknown;
};

type RetryLabels = {
	retryFailedMessage: string;
	stillProcessingMessage: string;
};

type MessageMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	hidden?: boolean;
	displayContent?: string;
	assistantAuthorName?: string;
	thread?: CommentThreadMetadata;
};

type SessionSnapshotMessage = {
	id: unknown;
	status?: unknown;
	content?: unknown;
	clientMessageId?: unknown;
	createdAt?: unknown;
	llmMetadata?: unknown;
};

type SessionSnapshotInput = {
	status?: unknown;
	tutorFeedback?: unknown;
	messages?: SessionSnapshotMessage[];
};

export type ChatMessage = {
	id: string;
	role: "user" | "agent";
	text: string;
	timestamp: string;
	authorName: string;
	avatar?: string;
	avatarColor?: string;
	isHidden?: boolean;
	deliveryState?: "sent" | "pending" | "failed";
	clientMessageId?: string;
	retryText?: string;
	llmMetadata?: unknown;
	thread?: CommentThreadMetadata;
};

function getMessageSortId(message: Pick<PersistedSessionMessage, "id">, fallback: number) {
	const numericId = typeof message.id === "number" ? message.id : Number.parseInt(String(message.id), 10);
	return Number.isFinite(numericId) ? numericId : fallback;
}

function compactStringSnapshot(value: string) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `${value.length}:${(hash >>> 0).toString(36)}`;
}

export function stableMetadataSnapshot(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return "";
	const metadata = value as { clientMessageId?: unknown; failed?: unknown; hidden?: unknown; mailBodyHtml?: unknown };
	return JSON.stringify({
		clientMessageId: metadata.clientMessageId ?? "",
		failed: metadata.failed === true,
		hidden: metadata.hidden === true,
		mailBodyHtml: typeof metadata.mailBodyHtml === "string" ? compactStringSnapshot(metadata.mailBodyHtml) : "",
	});
}

export function getSessionSnapshot(session: SessionSnapshotInput): string {
	const messagesSnapshot = sortPersistedSessionMessages(
		Array.isArray(session.messages) ? (session.messages as Array<SessionSnapshotMessage & Pick<PersistedSessionMessage, "id" | "createdAt">>) : [],
	)
		.map((m) => [m.id, m.status, m.content, m.clientMessageId ?? "", stableMetadataSnapshot(m.llmMetadata), m.createdAt].join(":"))
		.join("|");
	return `${session.status ?? ""}:${session.tutorFeedback ? "feedback" : ""}:${messagesSnapshot}`;
}

function getMessageMetadata(value: unknown): MessageMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as MessageMetadata;
}

function isAgentRole(role: string) {
	return role === "assistant" || role === "agent";
}

function getClientMessageId(message: Pick<PersistedSessionMessage, "llmMetadata">) {
	return getMessageMetadata(message.llmMetadata).clientMessageId;
}

export function orderPersistedSessionMessagesForDisplay<T extends PersistedSessionMessage>(messages: T[]): T[] {
	const sortedMessages = sortPersistedSessionMessages(messages);
	const userClientIds = new Set<string>();
	const assistantMessagesByClientId = new Map<string, T[]>();

	for (const message of sortedMessages) {
		const clientMessageId = getClientMessageId(message);
		if (!clientMessageId) continue;
		if (message.role === "user") {
			userClientIds.add(clientMessageId);
		} else if (isAgentRole(message.role)) {
			const assistantMessages = assistantMessagesByClientId.get(clientMessageId) ?? [];
			assistantMessages.push(message);
			assistantMessagesByClientId.set(clientMessageId, assistantMessages);
		}
	}

	const emitted = new Set<T>();
	const orderedMessages: T[] = [];

	for (const message of sortedMessages) {
		if (emitted.has(message)) continue;

		const clientMessageId = getClientMessageId(message);
		if (clientMessageId && isAgentRole(message.role) && userClientIds.has(clientMessageId)) {
			continue;
		}

		orderedMessages.push(message);
		emitted.add(message);

		if (message.role !== "user" || !clientMessageId) continue;

		for (const assistantMessage of assistantMessagesByClientId.get(clientMessageId) ?? []) {
			if (emitted.has(assistantMessage)) continue;
			orderedMessages.push(assistantMessage);
			emitted.add(assistantMessage);
		}
	}

	return orderedMessages;
}

function hasAssistantReplyInSameTurn(rawMessages: PersistedSessionMessage[], userMessageIndex: number) {
	const userMessage = rawMessages[userMessageIndex];
	if (!userMessage) return false;
	const clientMessageId = getClientMessageId(userMessage);
	if (clientMessageId) {
		const exactAssistant = rawMessages.find((message) => isAgentRole(message.role) && getClientMessageId(message) === clientMessageId);
		if (exactAssistant) return true;
	}

	for (let index = userMessageIndex + 1; index < rawMessages.length; index += 1) {
		const message = rawMessages[index];
		if (message.role === "user") return false;
		if (isAgentRole(message.role)) {
			const assistantClientMessageId = getClientMessageId(message);
			if (clientMessageId && assistantClientMessageId && assistantClientMessageId !== clientMessageId) continue;
			return true;
		}
	}

	return false;
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

export function sortPersistedSessionMessages<T extends Pick<PersistedSessionMessage, "id" | "createdAt">>(messages: T[]): T[] {
	return messages
		.map((message, index) => ({ message, index }))
		.sort((a, b) => {
			const createdAtDiff = parsePersistedMessageDate(a.message.createdAt).getTime() - parsePersistedMessageDate(b.message.createdAt).getTime();
			if (createdAtDiff !== 0) return createdAtDiff;

			const idDiff = getMessageSortId(a.message, a.index) - getMessageSortId(b.message, b.index);
			if (idDiff !== 0) return idDiff;

			return a.index - b.index;
		})
		.map(({ message }) => message);
}

function getRetryAgentCommentId(userCommentId: string | undefined, clientMessageId: string, persistedMessageId: number | string): string {
	if (userCommentId?.includes("-user-")) return userCommentId.replace("-user-", "-agent-");
	return `thread-agent-${clientMessageId || persistedMessageId}`;
}

export function buildChatMessages({
	rawMessages,
	formatTimestamp,
	userName,
	agentName,
	avatarUrl,
	agentColor,
	labels,
	isHidden = () => false,
}: {
	rawMessages: PersistedSessionMessage[];
	formatTimestamp: (date: Date) => string;
	userName: string;
	agentName: string;
	avatarUrl?: string;
	agentColor?: string;
	labels: RetryLabels;
	isHidden?: (message: PersistedSessionMessage) => boolean;
}): ChatMessage[] {
	const sortedRawMessages = orderPersistedSessionMessagesForDisplay(rawMessages);

	return sortedRawMessages.flatMap((message, index) => {
		const metadata = getMessageMetadata(message.llmMetadata);
		const mappedMessage = {
			id: message.id.toString(),
			role: message.role === "user" ? "user" : "agent",
			text: metadata.displayContent ?? message.content,
			timestamp: formatTimestamp(parsePersistedMessageDate(message.createdAt)),
			authorName: message.role === "user" ? userName : (metadata.assistantAuthorName ?? metadata.thread?.responderName ?? agentName),
			avatar: message.role === "user" ? avatarUrl : undefined,
			avatarColor: message.role !== "user" ? agentColor : undefined,
			isHidden: metadata.hidden === true || isHidden(message),
			clientMessageId: metadata.clientMessageId,
			llmMetadata: message.llmMetadata,
			thread: metadata.thread,
		} satisfies ChatMessage;

		if (message.role !== "user" || !metadata.clientMessageId || hasAssistantReplyInSameTurn(sortedRawMessages, index)) {
			return [mappedMessage];
		}

		const retryPlaceholder = {
			id: `retry-${message.id}`,
			role: "agent",
			text: metadata.failed === true ? labels.retryFailedMessage : labels.stillProcessingMessage,
			timestamp: formatTimestamp(parsePersistedMessageDate(message.createdAt)),
			authorName: metadata.assistantAuthorName ?? metadata.thread?.responderName ?? agentName,
			avatarColor: agentColor,
			deliveryState: metadata.failed === true ? "failed" : "pending",
			clientMessageId: metadata.clientMessageId,
			retryText: metadata.displayContent ?? message.content,
			llmMetadata: message.llmMetadata,
			...(metadata.thread
				? {
						thread: {
							...metadata.thread,
							commentId: getRetryAgentCommentId(metadata.thread.commentId, metadata.clientMessageId, message.id),
							parentCommentId: metadata.thread.commentId,
						},
					}
				: {}),
		} satisfies ChatMessage;

		return [mappedMessage, retryPlaceholder];
	});
}

export function updateMessageById(messages: ChatMessage[], messageId: string, updater: (message: ChatMessage) => ChatMessage): ChatMessage[] {
	return messages.map((message) => (message.id === messageId ? updater(message) : message));
}
