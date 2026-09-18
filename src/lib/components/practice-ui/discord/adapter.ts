import { normalizeText } from "../../utils/messageUtils";
import { getOpeningStateMessages, normalizeOpeningState } from "../messageTransformer";
import { createParticipantResolver, resolveAgentPresentation } from "../presentationAdapter";
import type { PracticePresentationAdapter } from "../types";
import type { ChatOpeningState } from "./types";
import type { initUserPool } from "./userPool";

export type DiscordPresentationContext = ReturnType<typeof initUserPool>;

export function createDiscordPresentationAdapter(): PracticePresentationAdapter<ChatOpeningState, DiscordPresentationContext> {
	const resolvePool = createParticipantResolver();
	return {
		normalizeOpeningState(value) {
			const state = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
			return {
				...normalizeOpeningState(value),
				serverName: normalizeText(state.serverName, ""),
				channelName: normalizeText(state.channelName, ""),
			};
		},
		resolvePresentation({ sessionId, openingState, userName }) {
			const pool = resolvePool(sessionId);
			return {
				agent: resolveAgentPresentation(openingState, userName, pool),
				context: pool ?? {
					agentUser: { id: "agent", name: "Agent", status: "Online", color: "bg-[#5865F2]", isAgent: true },
					onlineUsers: [],
					offlineUsers: [],
				},
			};
		},
		buildOpeningMessages: ({ openingState, presentation, userName, avatarUrl, earlier }) =>
			getOpeningStateMessages({
				openingStateData: openingState,
				// Keep anonymous opening authors identical to the existing seeded pool.
				agent: { name: presentation.context.agentUser.name, accentClass: presentation.context.agentUser.color },
				userName,
				avatarUrl,
				labels: { earlier },
			}),
	};
}
