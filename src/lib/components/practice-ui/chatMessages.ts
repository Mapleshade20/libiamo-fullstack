import type { Ao3MessageMetadata } from "./ao3/helpers";

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
	ao3?: Ao3MessageMetadata;
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
	ao3?: Ao3MessageMetadata;
};

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
	const messagesSnapshot = (Array.isArray(session.messages) ? session.messages : [])
		.map((m) => [m.id, m.status, m.content, m.clientMessageId ?? "", stableMetadataSnapshot(m.llmMetadata), m.createdAt].join(":"))
		.join("|");
	return `${session.status ?? ""}:${session.tutorFeedback ? "feedback" : ""}:${messagesSnapshot}`;
}

function getMessageMetadata(value: unknown): MessageMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as MessageMetadata;
}

function hasAssistantReplyInSameTurn(rawMessages: PersistedSessionMessage[], userMessageIndex: number) {
	for (let index = userMessageIndex + 1; index < rawMessages.length; index += 1) {
		const message = rawMessages[index];
		if (message.role === "user") return false;
		if (message.role === "assistant" || message.role === "agent") return true;
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
	return rawMessages.flatMap((message, index) => {
		const metadata = getMessageMetadata(message.llmMetadata);
		const mappedMessage = {
			id: message.id.toString(),
			role: message.role === "user" ? "user" : "agent",
			text: metadata.displayContent ?? message.content,
			timestamp: formatTimestamp(parsePersistedMessageDate(message.createdAt)),
			authorName: message.role === "user" ? userName : (metadata.assistantAuthorName ?? metadata.ao3?.responderName ?? agentName),
			avatar: message.role === "user" ? avatarUrl : undefined,
			avatarColor: message.role !== "user" ? agentColor : undefined,
			isHidden: metadata.hidden === true || isHidden(message),
			clientMessageId: metadata.clientMessageId,
			llmMetadata: message.llmMetadata,
			ao3: metadata.ao3,
		} satisfies ChatMessage;

		if (message.role !== "user" || !metadata.clientMessageId || hasAssistantReplyInSameTurn(rawMessages, index)) {
			return [mappedMessage];
		}

		const retryPlaceholder = {
			id: `retry-${message.id}`,
			role: "agent",
			text: metadata.failed === true ? labels.retryFailedMessage : labels.stillProcessingMessage,
			timestamp: formatTimestamp(parsePersistedMessageDate(message.createdAt)),
			authorName: metadata.assistantAuthorName ?? metadata.ao3?.responderName ?? agentName,
			avatarColor: agentColor,
			deliveryState: metadata.failed === true ? "failed" : "pending",
			clientMessageId: metadata.clientMessageId,
			retryText: metadata.displayContent ?? message.content,
			llmMetadata: message.llmMetadata,
			...(metadata.ao3
				? {
						ao3: {
							...metadata.ao3,
							commentId: metadata.clientMessageId ? `ao3-agent-${metadata.clientMessageId}` : `retry-${message.id}`,
							parentCommentId: metadata.ao3.commentId ?? (metadata.clientMessageId ? `ao3-user-${metadata.clientMessageId}` : undefined),
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
