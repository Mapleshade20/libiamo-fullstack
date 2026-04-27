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

export type DiscordSessionMessage = {
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
};

function getMessageMetadata(value: unknown): { clientMessageId?: string; failed?: boolean } {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as { clientMessageId?: string; failed?: boolean };
}

function hasAssistantReplyInSameTurn(rawMessages: PersistedSessionMessage[], userMessageIndex: number) {
	for (let index = userMessageIndex + 1; index < rawMessages.length; index += 1) {
		const message = rawMessages[index];
		if (message.role === "user") return false;
		if (message.role === "assistant") return true;
	}

	return false;
}

export function buildDiscordSessionMessages({
	rawMessages,
	formatTimestamp,
	userName,
	agentName,
	avatarUrl,
	agentColor,
	labels,
}: {
	rawMessages: PersistedSessionMessage[];
	formatTimestamp: (date: Date) => string;
	userName: string;
	agentName: string;
	avatarUrl?: string;
	agentColor?: string;
	labels: RetryLabels;
}): DiscordSessionMessage[] {
	return rawMessages.flatMap((message, index) => {
		const metadata = getMessageMetadata(message.llmMetadata);
		const mappedMessage = {
			id: message.id.toString(),
			role: message.role === "user" ? "user" : "agent",
			text: message.content,
			timestamp: formatTimestamp(new Date(message.createdAt)),
			authorName: message.role === "user" ? userName : agentName,
			avatar: message.role === "user" ? avatarUrl : undefined,
			avatarColor: message.role !== "user" ? agentColor : undefined,
			isHidden: message.content === "*User joined the server*",
			clientMessageId: metadata.clientMessageId,
		} satisfies DiscordSessionMessage;

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
				authorName: agentName,
				avatarColor: agentColor,
				deliveryState: metadata.failed === true ? "failed" : "pending",
				clientMessageId: metadata.clientMessageId,
				retryText: message.content,
			} satisfies DiscordSessionMessage,
		];
	});
}
