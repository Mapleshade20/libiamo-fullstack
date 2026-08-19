import type { ChatMessage } from "../practice-ui/chatMessages";

export interface SessionTemplateLike {
	maxTurns?: number | null;
}

export function calculateCurrentTurns(messages: ChatMessage[], _agentStartsFirst: boolean): number {
	// Turns are visible user messages, matching the server's maxTurns accounting for every layout.
	// Agent-side placeholders (pending/failed async deliveries) must never count as completed turns.
	return messages.filter((m) => m.role === "user" && !m.isHidden).length;
}

export function normalizeMaxTurns(maxTurns?: number | null): number {
	if (typeof maxTurns !== "number" || !Number.isFinite(maxTurns)) return 0;
	return Math.max(0, Math.floor(maxTurns));
}

export function hasTurnLimit(template?: SessionTemplateLike | null): boolean {
	const maxTurns = normalizeMaxTurns(template?.maxTurns);
	return maxTurns > 0;
}

export function isTurnLimitReached(currentTurns: number, maxTurns?: number | null): boolean {
	if (!maxTurns || maxTurns <= 0) return false;
	return currentTurns >= maxTurns;
}

export function getTurnLimitMessage(maxTurns?: number | null): string {
	if (!maxTurns || maxTurns <= 0) return "";
	return `This session has reached the maximum turn limit (${maxTurns}).`;
}

export function canContinueSession(currentTurns: number, template?: SessionTemplateLike | null): boolean {
	return !isTurnLimitReached(currentTurns, template?.maxTurns);
}

export function shouldAutoEndSession(currentTurns: number, template?: SessionTemplateLike | null): boolean {
	return isTurnLimitReached(currentTurns, template?.maxTurns);
}
