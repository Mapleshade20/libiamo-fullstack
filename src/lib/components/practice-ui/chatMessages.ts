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
	llmMetadata?: unknown;
};

function getMessageMetadata(value: unknown): { clientMessageId?: string; failed?: boolean; hidden?: boolean } {
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

function parsePersistedMessageDate(value: string | Date) {
	if (value instanceof Date) return value;
	const normalized = value.trim().replace(" ", "T");
	const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
	if (!hasTimeZone && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(normalized)) {
		return new Date(`${normalized}Z`);
	}
	return new Date(value);
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
			text: message.content,
			timestamp: formatTimestamp(parsePersistedMessageDate(message.createdAt)),
			authorName: message.role === "user" ? userName : agentName,
			avatar: message.role === "user" ? avatarUrl : undefined,
			avatarColor: message.role !== "user" ? agentColor : undefined,
			isHidden: metadata.hidden === true || isHidden(message),
			clientMessageId: metadata.clientMessageId,
			llmMetadata: message.llmMetadata,
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
				timestamp: formatTimestamp(parsePersistedMessageDate(message.createdAt)),
				authorName: agentName,
				avatarColor: agentColor,
				deliveryState: metadata.failed === true ? "failed" : "pending",
				clientMessageId: metadata.clientMessageId,
				retryText: message.content,
			} satisfies ChatMessage,
		];
	});
}

export function updateMessageById(messages: ChatMessage[], messageId: string, updater: (message: ChatMessage) => ChatMessage): ChatMessage[] {
	return messages.map((message) => (message.id === messageId ? updater(message) : message));
}
