import { describe, expect, it } from "vitest";
import { ASYNC_REPLY_DEMO_TASKS, wouldReachDemoMaxTurns } from "$lib/async-replies/live-demo";

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
});
