import { normalizeText } from "../../utils/messageUtils";
import { getOpeningStateMessages, normalizeOpeningState, resolveAgentName } from "../messageTransformer";
import type { PracticePresentationAdapter } from "../types";
import type { ChatOpeningState } from "./types";
import { initUserPool } from "./userPool";

export type DiscordPresentationContext = ReturnType<typeof initUserPool>;

export function createDiscordPresentationAdapter(): PracticePresentationAdapter<ChatOpeningState, DiscordPresentationContext> {
	let cachedId: number | null = null;
	let cachedPool: DiscordPresentationContext | undefined;
	let resolvedPool: DiscordPresentationContext | undefined;
	let resolvedSeed: DiscordPresentationContext | undefined;
	function resolvePool(id: number | null) {
		if (id === null) return undefined;
		if (!cachedPool || cachedId !== id) {
			cachedId = id;
			cachedPool = initUserPool(id);
		}
		return cachedPool;
	}
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
			const seeded = resolvePool(sessionId);
			const name = resolveAgentName(openingState, userName, seeded?.agentUser.name ?? "Agent");
			if (seeded !== resolvedSeed || resolvedPool?.agentUser.name !== name) {
				resolvedSeed = seeded;
				resolvedPool = seeded
					? {
							...seeded,
							agentUser: { ...seeded.agentUser, name },
							onlineUsers: seeded.onlineUsers.filter((user) => user.name !== name),
							offlineUsers: seeded.offlineUsers.filter((user) => user.name !== name),
						}
					: undefined;
			}
			const pool = resolvedPool;
			return {
				agent: { name, accentClass: pool?.agentUser.color ?? "bg-[#5865F2]" },
				context: pool ?? {
					agentUser: { id: "agent", name, status: "Online", color: "bg-[#5865F2]", isAgent: true },
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
