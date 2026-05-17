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
	ao3?: Ao3MessageMetadata;
};

function getMessageMetadata(value: unknown): {
	clientMessageId?: string;
	failed?: boolean;
	hidden?: boolean;
	displayContent?: string;
	assistantAuthorName?: string;
	ao3?: Ao3MessageMetadata;
} {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as { clientMessageId?: string; failed?: boolean; hidden?: boolean };
}

function hasAssistantReplyInSameTurn(rawMessages: PersistedSessionMessage[], userMessageIndex: number) {
	for (let index = userMessageIndex + 1; index < rawMessages.length; index += 1) {
		const message = rawMessages[index];
		if (message.role === "user") return false;
		if (message.role === "assistant" || message.role === "agent") return true;
	}

	return false;
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
			authorName: message.role === "user" ? userName : (metadata.assistantAuthorName ?? metadata.ao3?.responderName ?? agentName),
			avatar: message.role === "user" ? avatarUrl : undefined,
			avatarColor: message.role !== "user" ? agentColor : undefined,
			isHidden: metadata.hidden === true || isHidden(message),
			clientMessageId: metadata.clientMessageId,
			ao3: metadata.ao3,
		} satisfies ChatMessage;

		if (message.role !== "user" || !metadata.clientMessageId || hasAssistantReplyInSameTurn(rawMessages, index)) {
			return [mappedMessage];
		}

		return [
			mappedMessage,
			{
				id: `retry-${message.id}`,
				role: "agent",
				text: metadata.failed === true ? labels.retryFailedMessage : labels.stillProcessingMessage,
				timestamp: formatTimestamp(new Date(message.createdAt)),
				authorName: metadata.assistantAuthorName ?? metadata.ao3?.responderName ?? agentName,
				avatarColor: agentColor,
				deliveryState: metadata.failed === true ? "failed" : "pending",
				clientMessageId: metadata.clientMessageId,
				retryText: metadata.displayContent ?? message.content,
				ao3: {
					...metadata.ao3,
					commentId: metadata.clientMessageId ? `ao3-agent-${metadata.clientMessageId}` : `retry-${message.id}`,
					parentCommentId: metadata.ao3?.commentId ?? (metadata.clientMessageId ? `ao3-user-${metadata.clientMessageId}` : undefined),
				},
			} satisfies ChatMessage,
		];
	});
}

export function updateMessageById(messages: ChatMessage[], messageId: string, updater: (message: ChatMessage) => ChatMessage): ChatMessage[] {
	return messages.map((message) => (message.id === messageId ? updater(message) : message));
}
