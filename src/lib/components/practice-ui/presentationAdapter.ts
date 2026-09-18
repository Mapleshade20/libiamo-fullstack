import { getOpeningStateMessages, normalizeOpeningState, resolveAgentName } from "./messageTransformer";
import { initUserPool } from "./participantPool";
import type { PracticeAgentPresentation, PracticeOpeningState, PracticePresentationAdapter } from "./types";

/** Each adapter instance owns at most one session's deterministic participant context. */
export function createParticipantResolver() {
	let lastId: number | null = null;
	let pool: ReturnType<typeof initUserPool> | undefined;
	return (sessionId: number | null) => {
		if (sessionId === null) return undefined;
		if (!pool || lastId !== sessionId) {
			lastId = sessionId;
			pool = initUserPool(sessionId);
		}
		return pool;
	};
}

export function resolveAgentPresentation(openingState: PracticeOpeningState, userName: string, pool?: ReturnType<typeof initUserPool>) {
	return {
		name: resolveAgentName(openingState, userName, pool?.agentUser.name ?? "Agent"),
		accentClass: pool?.agentUser.color ?? "bg-[#5865F2]",
	};
}

export function createChatPresentationAdapter(): PracticePresentationAdapter<PracticeOpeningState, PracticeAgentPresentation> {
	const resolvePool = createParticipantResolver();
	return {
		normalizeOpeningState,
		resolvePresentation: ({ sessionId, openingState, userName }) => ({
			agent: resolveAgentPresentation(openingState, userName, resolvePool(sessionId)),
			context: resolveAgentPresentation({}, userName, resolvePool(sessionId)),
		}),
		buildOpeningMessages: ({ openingState, presentation, userName, avatarUrl, earlier }) =>
			getOpeningStateMessages({
				openingStateData: openingState,
				agent: presentation.context,
				userName,
				avatarUrl,
				labels: { earlier },
			}),
	};
}
