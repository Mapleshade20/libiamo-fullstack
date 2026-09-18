import { normalizeText } from "../utils/messageUtils";
import type { ChatMessage } from "./chatMessages";
import type { PracticeAgentPresentation, PracticeOpeningMessage, PracticeOpeningState } from "./types";

export function getOpeningStateMessages(params: {
	openingStateData: PracticeOpeningState;
	userName: string;
	agent: PracticeAgentPresentation;
	avatarUrl: string;
	labels: { earlier: string };
}): ChatMessage[] {
	const { openingStateData, userName, agent, avatarUrl, labels } = params;

	if (!Array.isArray(openingStateData.previousMessages)) return [];

	return openingStateData.previousMessages.flatMap((rawMessage, index) => {
		const sender = normalizeText(rawMessage.sender ?? rawMessage.author, "");
		const text = normalizeText(rawMessage.text ?? rawMessage.content, "");
		if (!text) return [];

		const isUserMessage = sender === userName;
		const authorName = sender || (isUserMessage ? userName : agent.name);

		return [
			{
				id: `opening-${index}-${authorName}`,
				role: isUserMessage ? "user" : "agent",
				text,
				timestamp: labels.earlier,
				authorName,
				avatar: isUserMessage ? avatarUrl : agent.avatarUrl,
				avatarColor: !isUserMessage ? agent.accentClass : undefined,
				deliveryState: "sent",
			} satisfies ChatMessage,
		];
	});
}

export function normalizeOpeningState(value: unknown): PracticeOpeningState {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const messages = (value as { previousMessages?: unknown }).previousMessages;
	if (!Array.isArray(messages)) return {};
	return {
		previousMessages: messages.filter(
			(message): message is PracticeOpeningMessage => Boolean(message) && typeof message === "object" && !Array.isArray(message),
		),
	};
}

export function resolveAgentName(openingState: PracticeOpeningState, userName: string, fallbackName: string): string {
	const messages = Array.isArray(openingState.previousMessages) ? openingState.previousMessages : [];
	for (const message of messages) {
		const sender = normalizeText(message.sender ?? message.author, "");
		if (sender && sender !== userName) return sender;
	}
	return fallbackName;
}
