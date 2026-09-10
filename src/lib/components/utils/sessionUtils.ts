import type { ChatMessage } from "../practice-ui/chatMessages";

export function calculateCurrentTurns(messages: ChatMessage[]): number {
	// Turns are visible user messages, matching the server's maxTurns accounting for every layout.
	// Agent-side placeholders (pending/failed async deliveries) must never count as completed turns.
	return messages.filter((m) => m.role === "user" && !m.isHidden).length;
}

export function isTurnLimitReached(currentTurns: number, maxTurns?: number | null): boolean {
	if (!maxTurns || maxTurns <= 0) return false;
	return currentTurns >= maxTurns;
}
