import { describe, expect, it } from "vitest";
import { lineupQuery, pickShownAttempt } from "$lib/task-attempts";

const attempt = (id: number, lineupId: number | null, finished: boolean) => ({ id, lineupId, finished });

describe("pickShownAttempt", () => {
	it("shows unfinished work wherever it was started", () => {
		const candidates = [attempt(3, 12, true), attempt(2, 11, false)];
		expect(pickShownAttempt(candidates, { lineupId: 12, pinned: false })?.id).toBe(2);
	});

	it("treats a task lined up again as fresh in its new lineup", () => {
		const candidates = [attempt(2, 11, true)];
		expect(pickShownAttempt(candidates, { lineupId: 12, pinned: false })).toBeNull();
		expect(pickShownAttempt(candidates, { lineupId: 11, pinned: false })?.id).toBe(2);
	});

	it("shows the latest attempt outside any lineup", () => {
		const candidates = [attempt(5, null, true), attempt(4, null, true)];
		expect(pickShownAttempt(candidates, { lineupId: null, pinned: false })?.id).toBe(5);
	});

	it("shows exactly the pinned lineup's attempt, even with unfinished work elsewhere", () => {
		const candidates = [attempt(6, 13, false), attempt(2, 11, true)];
		expect(pickShownAttempt(candidates, { lineupId: 11, pinned: true })?.id).toBe(2);
		expect(pickShownAttempt(candidates, { lineupId: 9, pinned: true })).toBeNull();
	});
});

describe("lineupQuery", () => {
	it("carries only a valid lineup pin", () => {
		expect(lineupQuery(new URL("https://libiamo.test/task/1?lineup=12"))).toBe("?lineup=12");
		expect(lineupQuery(new URL("https://libiamo.test/task/1?/start&lineup=12"))).toBe("?lineup=12");
		expect(lineupQuery(new URL("https://libiamo.test/task/1?lineup=abc"))).toBe("");
		expect(lineupQuery(new URL("https://libiamo.test/task/1"))).toBe("");
	});
});
