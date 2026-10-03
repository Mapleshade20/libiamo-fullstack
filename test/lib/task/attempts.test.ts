import { describe, expect, it } from "vitest";
import { pickShownAttempt, pinnedActionQuery, pinQuery } from "$lib/task/attempts";

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

	it("shows a pinned attempt exactly, and ignores an attempt pin that is not the learner's", () => {
		const candidates = [attempt(9, 11, false), attempt(8, 11, true), attempt(7, 11, true)];
		expect(pickShownAttempt(candidates, { lineupId: 11, pinned: true, attemptId: 7 })?.id).toBe(7);
		expect(pickShownAttempt(candidates, { lineupId: 11, pinned: true, attemptId: 99 })?.id).toBe(9);
	});
});

describe("pinQuery", () => {
	it("carries only a valid lineup and attempt pin", () => {
		expect(pinQuery(new URL("https://libiamo.test/task/1?lineup=12"))).toBe("?lineup=12");
		expect(pinQuery(new URL("https://libiamo.test/task/1?/start&lineup=12"))).toBe("?lineup=12");
		expect(pinQuery(new URL("https://libiamo.test/task/1?lineup=12&attempt=7"))).toBe("?lineup=12&attempt=7");
		expect(pinQuery(new URL("https://libiamo.test/task/1?lineup=abc&attempt=0"))).toBe("");
		expect(pinQuery(new URL("https://libiamo.test/task/1"))).toBe("");
	});

	it("drops the attempt pin when asked, so a fresh attempt is shown after starting over", () => {
		expect(pinQuery(new URL("https://libiamo.test/task/1?lineup=12&attempt=7"), { attempt: false })).toBe("?lineup=12");
	});
});

describe("pinnedActionQuery", () => {
	it("keeps the pin in front of the action name", () => {
		expect(pinnedActionQuery("", "start")).toBe("?/start");
		expect(pinnedActionQuery("?lineup=12", "retake")).toBe("?lineup=12&/retake");
		// SvelteKit reads the first `/`-prefixed search parameter as the action and keeps the rest.
		const url = new URL(`https://libiamo.test/task/1${pinnedActionQuery("?lineup=12", "retake")}`);
		expect([...url.searchParams.keys()]).toEqual(["lineup", "/retake"]);
		expect(pinQuery(url)).toBe("?lineup=12");
	});
});
