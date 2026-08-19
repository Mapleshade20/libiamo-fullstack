import { describe, expect, it } from "vitest";
import { getDeliveryDueAt, getUrgencyFollowUpAt, isStaleGeneration } from "$lib/server/async-replies/worker";

describe("async reply worker scheduling", () => {
	it("spaces multiple deliveries using content length", () => {
		const first = new Date("2026-08-19T12:00:00.000Z");
		const next = getDeliveryDueAt(first, "A short reply.");
		expect(next.getTime()).toBeGreaterThan(first.getTime());
		expect(getDeliveryDueAt(first, undefined)).toEqual(first);
	});

	it("uses urgency-specific idle follow-up windows", () => {
		const now = new Date("2026-08-19T12:00:00.000Z");
		expect(getUrgencyFollowUpAt(now, "high", 1).getTime()).toBe(now.getTime() + 2 * 60 * 60 * 1000);
		expect(getUrgencyFollowUpAt(now, "low", 2).getTime()).toBe(now.getTime() + 48 * 60 * 60 * 1000);
	});

	it("marks newer user input and completed sessions stale", () => {
		expect(isStaleGeneration({ expectedInputMessageId: 4, latestUserMessageId: 5, sessionStatus: "in_progress" })).toBe(true);
		expect(isStaleGeneration({ expectedInputMessageId: 4, latestUserMessageId: 4, sessionStatus: "completed" })).toBe(true);
		expect(isStaleGeneration({ expectedInputMessageId: 4, latestUserMessageId: 4, sessionStatus: "in_progress" })).toBe(false);
	});
});
