import { getOpeningStateMessages, normalizeOpeningState, resolveAgentName } from "./messageTransformer";
import type { PracticeAgentPresentation, PracticeOpeningState, PracticePresentationAdapter } from "./types";

export function createChatPresentationAdapter(): PracticePresentationAdapter<PracticeOpeningState, PracticeAgentPresentation> {
	return {
		normalizeOpeningState,
		resolvePresentation: ({ openingState, userName }) => {
			const agent = { name: resolveAgentName(openingState, userName, "Agent") };
			return { agent, context: agent };
		},
		buildOpeningMessages: ({ openingState, presentation, userName, avatarUrl, earlier }) =>
			getOpeningStateMessages({ openingStateData: openingState, agent: presentation.agent, userName, avatarUrl, labels: { earlier } }),
	};
}
