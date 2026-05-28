// TODO: back with Redis for multi-instance
const callBuckets = new Map<string, number[]>();
const tokenCounters = new Map<string, number>();

export type LlmAction =
	| "generateExpressions"
	| "evaluateTranslation"
	| "askTutor"
	| "generateModelTranslation"
	| "explainFeedback"
	| "translateSentence"
	| "submit";

export interface LlmRateLimitResult {
	ok: boolean;
	retryAfterSec?: number;
	scope?: "minute" | "hour" | "dailyTokens";
}

interface ActionLimits {
	perMinute: number;
	perHour: number;
}

export const LIMITS: Record<LlmAction, ActionLimits> = {
	generateExpressions: { perMinute: 10, perHour: 60 },
	evaluateTranslation: { perMinute: 20, perHour: 120 },
	askTutor: { perMinute: 10, perHour: 60 },
	generateModelTranslation: { perMinute: 5, perHour: 30 },
	explainFeedback: { perMinute: 10, perHour: 60 },
	translateSentence: { perMinute: 30, perHour: 200 },
	submit: { perMinute: 5, perHour: 30 },
};

const DAILY_TOKEN_LIMIT = 200_000;

function dayKey(now: number): number {
	return Math.floor(now / 86_400_000);
}

function pruneWindow(timestamps: number[], windowMs: number, now: number): number[] {
	const cutoff = now - windowMs;
	return timestamps.filter((ts) => ts > cutoff);
}

export function checkLlmRateLimit(userId: string, action: LlmAction): LlmRateLimitResult {
	const now = Date.now();
	const limits = LIMITS[action];

	// Check daily token budget
	const tk = `${userId}:${dayKey(now)}`;
	const usedTokens = tokenCounters.get(tk) ?? 0;
	if (usedTokens >= DAILY_TOKEN_LIMIT) {
		const msUntilMidnight = 86_400_000 - (now % 86_400_000);
		return {
			ok: false,
			scope: "dailyTokens",
			retryAfterSec: Math.ceil(msUntilMidnight / 1000),
		};
	}

	// Check per-minute window
	const mk = `${userId}:${action}:m`;
	const minuteBucket = pruneWindow(callBuckets.get(mk) ?? [], 60_000, now);
	if (minuteBucket.length >= limits.perMinute) {
		const retryAfterMs = 60_000 - (now - minuteBucket[0]);
		callBuckets.set(mk, minuteBucket);
		return {
			ok: false,
			scope: "minute",
			retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
		};
	}

	// Check per-hour window
	const hk = `${userId}:${action}:h`;
	const hourBucket = pruneWindow(callBuckets.get(hk) ?? [], 3_600_000, now);
	if (hourBucket.length >= limits.perHour) {
		const retryAfterMs = 3_600_000 - (now - hourBucket[0]);
		callBuckets.set(hk, hourBucket);
		return {
			ok: false,
			scope: "hour",
			retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
		};
	}

	// Record this call in both windows
	minuteBucket.push(now);
	callBuckets.set(mk, minuteBucket);
	hourBucket.push(now);
	callBuckets.set(hk, hourBucket);

	return { ok: true };
}

export function recordLlmTokens(userId: string, totalTokens: number): void {
	const now = Date.now();
	const tk = `${userId}:${dayKey(now)}`;
	tokenCounters.set(tk, (tokenCounters.get(tk) ?? 0) + totalTokens);
}

/** Reset all in-memory state. Only for use in tests. */
export function _resetForTesting(): void {
	callBuckets.clear();
	tokenCounters.clear();
}
