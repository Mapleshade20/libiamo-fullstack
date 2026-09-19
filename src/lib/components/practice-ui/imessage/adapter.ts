import { stableChoice } from "../identityFallback";
import { getOpeningStateMessages, normalizeOpeningState } from "../messageTransformer";
import type { PracticeOpeningState, PracticePresentation, PracticePresentationAdapter } from "../types";

const CONTACTS = ["Alex Morgan", "Jordan Lee", "Taylor Kim", "Sam Rivera", "Casey Nguyen"] as const;

type IMessagePresentation = PracticePresentation<{ name: string }>;

export function createIMessagePresentationAdapter(): PracticePresentationAdapter<PracticeOpeningState, { name: string }> {
	return {
		normalizeOpeningState,
		resolvePresentation: ({ sessionId, openingState, userName }): IMessagePresentation => {
			const sender = openingState.previousMessages
				?.map((message) => String(message.sender ?? message.author ?? ""))
				.find((name) => name && name !== userName);
			const name = sender || stableChoice(`imessage:${sessionId ?? "scene"}`, CONTACTS);
			return { agent: { name }, context: { name } };
		},
		buildOpeningMessages: ({ openingState, presentation, userName, avatarUrl, earlier }) =>
			getOpeningStateMessages({ openingStateData: openingState, agent: presentation.agent, userName, avatarUrl, labels: { earlier } }),
	};
}
