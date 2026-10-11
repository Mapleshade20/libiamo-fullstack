import { describe, expect, it } from "vitest";
import { URGENCY_PRESETS } from "$lib/constants";
import { getDeliveryDelayMs, getSessionExpiry, sampleReplyDelayMs } from "$lib/practice/reply-timing";

describe("agent reply timing", () => {
	it.each(["high", "medium", "low"] as const)("samples %s reply delay from an exponential capped at its preset", (urgency) => {
		const preset = URGENCY_PRESETS[urgency];
		// u = 0 -> zero delay (instant reply); u -> 1 grows without bound but is capped.
		expect(sampleReplyDelayMs(urgency, () => 0)).toBe(0);
		expect(sampleReplyDelayMs(urgency, () => 0.632_120_558_829)).toBe(preset.replyMtthMs);
		expect(sampleReplyDelayMs(urgency, () => 1)).toBe(preset.replyCapMs);
	});

	it("computes expiry from a fixed start time", () => {
		const startedAt = new Date("2025-06-11T12:00:00.000Z");
		expect(getSessionExpiry(startedAt, 43_200).toISOString()).toBe("2025-06-12T00:00:00.000Z");
	});

	it("uses Unicode characters and clamps delivery intervals", () => {
		expect(getDeliveryDelayMs("hi")).toBeGreaterThan(0);
		expect(getDeliveryDelayMs("x".repeat(100))).toBeGreaterThan(getDeliveryDelayMs("hi"));
		expect(getDeliveryDelayMs("😀".repeat(100))).toBe(getDeliveryDelayMs("x".repeat(100)));
		expect(getDeliveryDelayMs("x".repeat(1_000))).toBe(getDeliveryDelayMs("x".repeat(10_000)));
	});
});
