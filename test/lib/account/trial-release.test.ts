import { describe, expect, it } from "vitest";
import { nextTrialRelease, releasedTrialTokens, TRIAL_RELEASE_INTERVAL_MS, trialQuotaWarning } from "$lib/account/trial-release";

const signUp = new Date("2026-10-01T08:00:00Z");
const sinceSignUp = (ms: number) => new Date(signUp.getTime() + ms);

describe("trial release schedule", () => {
	it("releases a third at sign-up, a third after 24 hours and the rest after 48 hours", () => {
		expect(releasedTrialTokens(50_000, signUp, signUp)).toBe(16_666);
		expect(releasedTrialTokens(50_000, signUp, sinceSignUp(TRIAL_RELEASE_INTERVAL_MS - 1))).toBe(16_666);
		expect(releasedTrialTokens(50_000, signUp, sinceSignUp(TRIAL_RELEASE_INTERVAL_MS))).toBe(33_333);
		expect(releasedTrialTokens(50_000, signUp, sinceSignUp(2 * TRIAL_RELEASE_INTERVAL_MS))).toBe(50_000);
		expect(releasedTrialTokens(50_000, signUp, sinceSignUp(30 * TRIAL_RELEASE_INTERVAL_MS))).toBe(50_000);
	});

	it("names the next part until the whole grant is out", () => {
		expect(nextTrialRelease(50_000, signUp, signUp)).toEqual({ at: sinceSignUp(TRIAL_RELEASE_INTERVAL_MS), tokens: 16_667 });
		expect(nextTrialRelease(50_000, signUp, sinceSignUp(TRIAL_RELEASE_INTERVAL_MS))).toEqual({
			at: sinceSignUp(2 * TRIAL_RELEASE_INTERVAL_MS),
			tokens: 16_667,
		});
		expect(nextTrialRelease(50_000, signUp, sinceSignUp(2 * TRIAL_RELEASE_INTERVAL_MS))).toBeNull();
	});

	it("never releases before sign-up, whatever the clock says", () => {
		expect(releasedTrialTokens(50_000, signUp, sinceSignUp(-TRIAL_RELEASE_INTERVAL_MS))).toBe(16_666);
	});
});

describe("trialQuotaWarning", () => {
	const balance = (left: number, nextReleaseAt: Date | null) => ({
		trialTokensLeft: left,
		trialTokensTotal: 50_000,
		trialTokensReleased: 50_000,
		trialNextReleaseAt: nextReleaseAt,
	});

	it("warns about a low balance only when nothing more is coming", () => {
		expect(trialQuotaWarning(balance(4_000, null))).toBe("low");
		expect(trialQuotaWarning(balance(4_000, signUp))).toBeNull();
	});

	it("always reports an empty balance", () => {
		expect(trialQuotaWarning(balance(0, null))).toBe("depleted");
		expect(trialQuotaWarning(balance(0, signUp))).toBe("depleted");
	});
});
