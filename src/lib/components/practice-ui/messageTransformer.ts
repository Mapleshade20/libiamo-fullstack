import { normalizeText } from "../utils/messageUtils";
import type { DiscordSessionMessage } from "./discordSessionMessages";
import type { DiscordOpeningState, DiscordUser } from "./types";

export function getOpeningStateMessages(params: {
	openingStateData: DiscordOpeningState;
	userName: string;
	agentUser: DiscordUser;
	avatarUrl: string;
	labels: { earlier: string };
}): DiscordSessionMessage[] {
	const { openingStateData, userName, agentUser, avatarUrl, labels } = params;

	if (!Array.isArray(openingStateData.previousMessages)) return [];

	return openingStateData.previousMessages.flatMap((rawMessage, index) => {
		const sender = normalizeText(rawMessage.sender ?? rawMessage.author, "");
		const text = normalizeText(rawMessage.text ?? rawMessage.content, "");
		if (!text) return [];

		const isUserMessage = sender === userName;
		const authorName = sender || (isUserMessage ? userName : agentUser.name);

		return [
			{
				id: `opening-${index}-${authorName}`,
				role: isUserMessage ? "user" : "agent",
				text,
				timestamp: labels.earlier,
				authorName,
				avatar: isUserMessage ? avatarUrl : undefined,
				avatarColor: !isUserMessage ? agentUser.color : undefined,
				deliveryState: "sent",
			} as DiscordSessionMessage,
		];
	});
}
