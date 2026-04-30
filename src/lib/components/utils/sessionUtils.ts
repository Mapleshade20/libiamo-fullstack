export interface SessionTemplateLike {
	maxTurns?: number | null;
}

export function normalizeMaxTurns(maxTurns?: number | null): number {
	if (typeof maxTurns !== "number" || !Number.isFinite(maxTurns)) return 0;
	return Math.max(0, Math.floor(maxTurns));
}

export function hasTurnLimit(template?: SessionTemplateLike | null): boolean {
	const maxTurns = normalizeMaxTurns(template?.maxTurns);
	return maxTurns > 0;
}

export function isTurnLimitReached(messageCount: number, maxTurns?: number | null): boolean {
	const limit = normalizeMaxTurns(maxTurns);
	if (limit <= 0) return false;
	return messageCount >= limit;
}

export function canContinueSession(messageCount: number, template?: SessionTemplateLike | null): boolean {
	return !isTurnLimitReached(messageCount, template?.maxTurns);
}

export function getTurnLimitMessage(maxTurns?: number | null): string {
	const limit = normalizeMaxTurns(maxTurns);
	if (limit <= 0) return "";

	return `This session has reached the maximum turn limit (${limit}).`;
}

export function shouldAutoEndSession(messageCount: number, template?: SessionTemplateLike | null): boolean {
	return isTurnLimitReached(messageCount, template?.maxTurns);
}
