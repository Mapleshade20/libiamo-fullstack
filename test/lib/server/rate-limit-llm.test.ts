import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetForTesting, checkLlmRateLimit, LIMITS, recordLlmTokens } from "$lib/server/rate-limit-llm";

const BASE_TIME = new Date("2024-01-15T12:00:00.000Z").getTime();

describe("LLM rate limiter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(BASE_TIME);
		_resetForTesting();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("under-limit calls", () => {
		it("returns ok: true for all calls within the per-minute limit", () => {
			for (let i = 0; i < LIMITS.generateExpressions.perMinute; i++) {
				const result = checkLlmRateLimit("user1", "generateExpressions");
				expect(result.ok).toBe(true);
				vi.advanceTimersByTime(100);
			}
		});
	});

	describe("per-minute limit", () => {
		it("returns ok: false with scope: minute on the (N+1)-th call within a minute", () => {
			for (let i = 0; i < LIMITS.generateExpressions.perMinute; i++) {
				checkLlmRateLimit("user1", "generateExpressions");
			}
			const result = checkLlmRateLimit("user1", "generateExpressions");
			expect(result.ok).toBe(false);
			expect(result.scope).toBe("minute");
			expect(result.retryAfterSec).toBeGreaterThan(0);
		});

		it("retryAfterSec is positive when rate limited", () => {
			for (let i = 0; i < LIMITS.submit.perMinute; i++) {
				checkLlmRateLimit("user1", "submit");
			}
			const result = checkLlmRateLimit("user1", "submit");
			expect(result.ok).toBe(false);
			expect(result.retryAfterSec).toBeGreaterThan(0);
		});
	});

	describe("per-action isolation", () => {
		it("quota for generateExpressions does not affect evaluateTranslation", () => {
			for (let i = 0; i < LIMITS.generateExpressions.perMinute; i++) {
				checkLlmRateLimit("user1", "generateExpressions");
			}
			expect(checkLlmRateLimit("user1", "generateExpressions").ok).toBe(false);
			expect(checkLlmRateLimit("user1", "evaluateTranslation").ok).toBe(true);
		});

		it("quota for submit does not affect askTutor", () => {
			for (let i = 0; i < LIMITS.submit.perMinute; i++) {
				checkLlmRateLimit("user1", "submit");
			}
			expect(checkLlmRateLimit("user1", "submit").ok).toBe(false);
			expect(checkLlmRateLimit("user1", "askTutor").ok).toBe(true);
		});
	});

	describe("per-user isolation", () => {
		it("quota for user1 does not affect user2", () => {
			for (let i = 0; i < LIMITS.generateExpressions.perMinute; i++) {
				checkLlmRateLimit("user1", "generateExpressions");
			}
			expect(checkLlmRateLimit("user1", "generateExpressions").ok).toBe(false);
			expect(checkLlmRateLimit("user2", "generateExpressions").ok).toBe(true);
		});
	});

	describe("window expiry", () => {
		it("allows calls again after the 60-second window passes", () => {
			for (let i = 0; i < LIMITS.generateExpressions.perMinute; i++) {
				checkLlmRateLimit("user1", "generateExpressions");
			}
			expect(checkLlmRateLimit("user1", "generateExpressions").ok).toBe(false);

			vi.advanceTimersByTime(61_000);

			expect(checkLlmRateLimit("user1", "generateExpressions").ok).toBe(true);
		});
	});

	describe("daily token limit", () => {
		it("recordLlmTokens accumulates correctly and stays under limit", () => {
			recordLlmTokens("user1", 100_000);
			recordLlmTokens("user1", 50_000);
			recordLlmTokens("user1", 49_999);
			// 199_999 total — still under 200_000
			expect(checkLlmRateLimit("user1", "generateExpressions").ok).toBe(true);
		});

		it("returns ok: false with scope: dailyTokens once daily total exceeds 200K", () => {
			recordLlmTokens("user1", 200_001);
			const result = checkLlmRateLimit("user1", "generateExpressions");
			expect(result.ok).toBe(false);
			expect(result.scope).toBe("dailyTokens");
			expect(result.retryAfterSec).toBeGreaterThan(0);
		});

		it("dailyTokens block applies to any action for the affected user", () => {
			recordLlmTokens("user1", 200_001);
			expect(checkLlmRateLimit("user1", "askTutor").ok).toBe(false);
			expect(checkLlmRateLimit("user1", "translateSentence").ok).toBe(false);
		});

		it("dailyTokens block does not affect other users", () => {
			recordLlmTokens("user1", 200_001);
			expect(checkLlmRateLimit("user1", "generateExpressions").ok).toBe(false);
			expect(checkLlmRateLimit("user2", "generateExpressions").ok).toBe(true);
		});

		it("restores budget after UTC day rollover", () => {
			recordLlmTokens("user1", 200_001);
			expect(checkLlmRateLimit("user1", "generateExpressions").ok).toBe(false);

			// Advance past midnight UTC
			vi.advanceTimersByTime(86_400_000 + 1);

			expect(checkLlmRateLimit("user1", "generateExpressions").ok).toBe(true);
		});

		it("retryAfterSec for dailyTokens is seconds until midnight", () => {
			// BASE_TIME is 2024-01-15T12:00:00Z — exactly halfway through the day
			recordLlmTokens("user1", 200_001);
			const result = checkLlmRateLimit("user1", "generateExpressions");
			expect(result.ok).toBe(false);
			expect(result.scope).toBe("dailyTokens");
			// ~12 hours until midnight = 43200 seconds
			expect(result.retryAfterSec).toBeGreaterThanOrEqual(43_199);
			expect(result.retryAfterSec).toBeLessThanOrEqual(43_201);
		});
	});
});
