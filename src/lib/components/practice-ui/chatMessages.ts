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
	thread?: CommentThreadMetadata;
};

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
	return rawMessages.flatMap((message, index) => {
		const metadata = getMessageMetadata(message.llmMetadata);
		const mappedMessage = {
			id: message.id.toString(),
			role: message.role === "user" ? "user" : "agent",
			text: metadata.displayContent ?? message.content,
			timestamp: formatTimestamp(new Date(message.createdAt)),
			authorName: message.role === "user" ? userName : (metadata.assistantAuthorName ?? metadata.thread?.responderName ?? agentName),
			avatar: message.role === "user" ? avatarUrl : undefined,
			avatarColor: message.role !== "user" ? agentColor : undefined,
			isHidden: metadata.hidden === true || isHidden(message),
			clientMessageId: metadata.clientMessageId,
			thread: metadata.thread,
		} satisfies ChatMessage;

		if (message.role !== "user" || !metadata.clientMessageId || hasAssistantReplyInSameTurn(rawMessages, index)) {
			return [mappedMessage];
		}

		const retryPlaceholder = {
			id: `retry-${message.id}`,
			role: "agent",
			text: metadata.failed === true ? labels.retryFailedMessage : labels.stillProcessingMessage,
			timestamp: formatTimestamp(new Date(message.createdAt)),
			authorName: metadata.assistantAuthorName ?? metadata.thread?.responderName ?? agentName,
			avatarColor: agentColor,
			deliveryState: metadata.failed === true ? "failed" : "pending",
			clientMessageId: metadata.clientMessageId,
			retryText: metadata.displayContent ?? message.content,
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
