import { describe, expect, it } from "vitest";
import { AGENT_WORK_DUE_SOON_MS, AGENT_WORK_WAKE_BUFFER_MS, planAgentWorkPolling } from "$lib/practice/agent-work-polling";

describe("planAgentWorkPolling", () => {
	const now = new Date("2026-08-23T12:00:00.000Z");

	it("polls continuously while a placeholder is pending even without scheduled work", () => {
		expect(planAgentWorkPolling({ hasPendingPlaceholder: true, agentWorkDueAt: null, now })).toEqual({ kind: "interval" });
	});

	it("polls while agent work is due within the horizon", () => {
		expect(planAgentWorkPolling({ hasPendingPlaceholder: false, agentWorkDueAt: new Date(now.getTime() + AGENT_WORK_DUE_SOON_MS), now })).toEqual({
			kind: "interval",
		});
	});

	it("wakes once when the next agent work is far in the future", () => {
		const dueAt = new Date(now.getTime() + 10 * 60_000);
		expect(planAgentWorkPolling({ hasPendingPlaceholder: false, agentWorkDueAt: dueAt, now })).toEqual({
			kind: "wake",
			delayMs: 10 * 60_000 + AGENT_WORK_WAKE_BUFFER_MS,
		});
	});

	it("stops watching when no agent work is outstanding", () => {
		expect(planAgentWorkPolling({ hasPendingPlaceholder: false, agentWorkDueAt: null, now })).toEqual({ kind: "none" });
	});
});
