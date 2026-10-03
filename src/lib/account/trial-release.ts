/**
 * The shared trial is released in three equal parts: one at sign-up, one 24 hours later and the
 * last 48 hours after sign-up. A throwaway account therefore gets a third of the budget on its first
 * day, while a learner who comes back still receives all of it.
 */
export const TRIAL_RELEASE_PARTS = 3;
export const TRIAL_RELEASE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** How much of `total` is due `now` for a trial whose release started at `startedAt`. */
export function releasedTrialTokens(total: number, startedAt: Date, now: Date): number {
	return trialTokensForParts(total, releasedTrialParts(startedAt, now));
}

/** The next part still to come, or null once everything is released. */
export function nextTrialRelease(total: number, startedAt: Date, now: Date): { at: Date; tokens: number } | null {
	const parts = releasedTrialParts(startedAt, now);
	if (parts >= TRIAL_RELEASE_PARTS) return null;
	return {
		at: new Date(startedAt.getTime() + parts * TRIAL_RELEASE_INTERVAL_MS),
		tokens: trialTokensForParts(total, parts + 1) - trialTokensForParts(total, parts),
	};
}

function releasedTrialParts(startedAt: Date, now: Date): number {
	const elapsed = Math.max(0, now.getTime() - startedAt.getTime());
	return Math.min(TRIAL_RELEASE_PARTS, 1 + Math.floor(elapsed / TRIAL_RELEASE_INTERVAL_MS));
}

function trialTokensForParts(total: number, parts: number): number {
	// The last part takes the rounding remainder, so the parts always add up to the grant.
	return parts >= TRIAL_RELEASE_PARTS ? total : Math.floor((total * parts) / TRIAL_RELEASE_PARTS);
}

export type TrialQuotaBalance = {
	trialTokensLeft: number;
	/** The whole grant, released or not. */
	trialTokensTotal: number;
	/** The part of the grant released so far. */
	trialTokensReleased: number;
	/** When the next part arrives, or null once the whole grant is released. */
	trialNextReleaseAt: Date | null;
};

export type TrialQuotaWarning = "low" | "depleted";

/** "Low" only warns about a balance nothing else will top up; an empty balance always shows. */
export function trialQuotaWarning(balance: TrialQuotaBalance): TrialQuotaWarning | null {
	if (balance.trialTokensLeft <= 0) return "depleted";
	if (balance.trialNextReleaseAt) return null;
	if (balance.trialTokensLeft <= Math.floor(balance.trialTokensTotal * 0.1)) return "low";
	return null;
}
