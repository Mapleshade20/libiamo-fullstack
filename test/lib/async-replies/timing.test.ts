import { describe, expect, it } from "vitest";
import { getDeliveryDelayMs, getSessionExpiry, sampleReplyDelayMs } from "$lib/async-replies/timing";
import { URGENCY_PRESETS } from "$lib/constants";

describe("async reply timing", () => {
	it.each(["high", "medium", "low"] as const)("samples %s reply delay inside its preset", (urgency) => {
		const preset = URGENCY_PRESETS[urgency];
		expect(sampleReplyDelayMs(urgency, () => 0)).toBe(preset.replyDelayMinMs);
		expect(sampleReplyDelayMs(urgency, () => 1)).toBe(preset.replyDelayMaxMs);
		expect(sampleReplyDelayMs(urgency, () => 0.5)).toBeGreaterThanOrEqual(preset.replyDelayMinMs);
		expect(sampleReplyDelayMs(urgency, () => 0.5)).toBeLessThanOrEqual(preset.replyDelayMaxMs);
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
