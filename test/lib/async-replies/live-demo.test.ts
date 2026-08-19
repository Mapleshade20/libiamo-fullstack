import { describe, expect, it } from "vitest";
import { ASYNC_REPLY_DEMO_TASKS, simulatedDemoDecision, wouldReachDemoMaxTurns } from "$lib/async-replies/live-demo";

describe("async reply live demo fixtures", () => {
	it("provides two fixed production-shaped tasks", () => {
		expect(ASYNC_REPLY_DEMO_TASKS).toHaveLength(2);
		expect(ASYNC_REPLY_DEMO_TASKS.map((task) => task.ui)).toEqual(["discord", "reddit"]);
	});

	it("cancels exactly when the saved user turn reaches maxTurns", () => {
		const task = ASYNC_REPLY_DEMO_TASKS[1];
		expect(wouldReachDemoMaxTurns(task, [{ role: "user" }, { role: "assistant" }, { role: "user" }])).toBe(false);
		expect(wouldReachDemoMaxTurns(task, [{ role: "user" }, { role: "user" }, { role: "user" }])).toBe(true);
	});

	it("covers no-reply, idle follow-up and abuse termination states", () => {
		expect(simulatedDemoDecision("no_reply").allowIdleFollowUp).toBe(false);
		expect(simulatedDemoDecision("follow_up").allowIdleFollowUp).toBe(true);
		expect(simulatedDemoDecision("terminate_abuse").decision).toBe("terminate_abuse");
	});
});
