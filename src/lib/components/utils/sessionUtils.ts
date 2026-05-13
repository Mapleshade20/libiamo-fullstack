import type { ChatMessage } from "../practice-ui/chatMessages";

export interface SessionTemplateLike {
	maxTurns?: number | null;
}

export function calculateCurrentTurns(messages: ChatMessage[], agentStartsFirst: boolean): number {
	if (agentStartsFirst) {
		return messages.filter((m) => m.role === "user" && !m.isHidden).length;
	} else {
		return messages.filter((m) => m.role === "agent" && !m.isHidden).length;
	}
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
