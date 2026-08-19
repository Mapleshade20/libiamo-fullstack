import { describe, expect, it } from "vitest";
import { getDeliveryDelayMs, getSessionExpiry, sampleReplyDelayMs } from "$lib/async-replies/timing";
import { URGENCY_PRESETS } from "$lib/constants";

describe("async reply timing", () => {
	it.each(["high", "medium", "low"] as const)("samples %s reply delay from an exponential capped at its preset", (urgency) => {
		const preset = URGENCY_PRESETS[urgency];
		// u = 0 -> zero delay (instant reply); u -> 1 grows without bound but is capped.
		expect(sampleReplyDelayMs(urgency, () => 0)).toBe(0);
		expect(sampleReplyDelayMs(urgency, () => 0.632_120_558_829)).toBe(preset.replyMtthMs);
		expect(sampleReplyDelayMs(urgency, () => 1)).toBe(preset.replyCapMs);
	});

	it.each(["high", "medium", "low"] as const)("keeps %s samples within the cap across many draws", (urgency) => {
		const preset = URGENCY_PRESETS[urgency];
		let seed = 987_654_321;
		const draw = () => {
			seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
			return seed / 4_294_967_296;
		};
		let sum = 0;
		for (let i = 0; i < 5_000; i++) {
			const delay = sampleReplyDelayMs(urgency, draw);
			expect(delay).toBeLessThanOrEqual(preset.replyCapMs);
			sum += delay;
		}
		// With only ~1.8% of high tail clipped, the empirical mean should stay near the MTTH.
		expect(sum / 5_000).toBeGreaterThan(preset.replyMtthMs * 0.7);
		expect(sum / 5_000).toBeLessThan(preset.replyMtthMs * 1.3);
	});

	it("computes expiry from a fixed start time", () => {
		const startedAt = new Date("2025-06-11T12:00:00.000Z");
		expect(getSessionExpiry(startedAt, 43_200).toISOString()).toBe("2025-06-12T00:00:00.000Z");
	});

	it("uses Unicode characters and clamps delivery intervals", () => {
		expect(getDeliveryDelayMs("hi")).toBe(1_500);
		expect(getDeliveryDelayMs("你".repeat(100))).toBe(5_600);
		expect(getDeliveryDelayMs("x".repeat(1_000))).toBe(20_000);
	});
});
