import { describe, expect, it } from "vitest";
import { formatRelativeAge, formatUnreadBadgeCount, unreadTargetHref } from "$lib/unread";

describe("unread helpers", () => {
	it("targets the session page for in-progress conversations and feedback otherwise", () => {
		expect(unreadTargetHref({ taskId: 4, lineupId: null, sessionStatus: "in_progress" })).toBe("/task/4/session");
		expect(unreadTargetHref({ taskId: 7, lineupId: null, sessionStatus: "completed" })).toBe("/task/7/feedback");
		expect(unreadTargetHref({ taskId: 8, lineupId: null, sessionStatus: "evaluated" })).toBe("/task/8/feedback");
	});

	// An abuse termination abandons the session but still delivers the agent's
	// parting reply. The feedback page refuses abandoned sessions, so the unread
	// entry has to lead to the transcript instead.
	it("targets the transcript for abandoned conversations", () => {
		expect(unreadTargetHref({ taskId: 9, lineupId: null, sessionStatus: "abandoned" })).toBe("/task/9/session");
	});

	it("applies the configured application base path to canonical targets", () => {
		expect(unreadTargetHref({ taskId: 4, lineupId: null, sessionStatus: "in_progress" }, "/libiamo")).toBe("/libiamo/task/4/session");
	});

	it("pins targets to the session's lineup", () => {
		expect(unreadTargetHref({ taskId: 4, lineupId: 12, sessionStatus: "abandoned" })).toBe("/task/4/session?lineup=12");
	});

	it("caps the compact badge at nine while retaining exact totals elsewhere", () => {
		expect([0, 1, 9, 10].map(formatUnreadBadgeCount)).toEqual(["0", "1", "9", "9+"]);
	});

	it("formats relative ages across unit boundaries", () => {
		expect(formatRelativeAge(30, "en")).toContain("now");
		expect(formatRelativeAge(90, "en")).toContain("minute");
		expect(formatRelativeAge(90 * 60, "en")).toContain("hour");
		expect(formatRelativeAge(26 * 60 * 60, "en")).toContain("day");
		expect(formatRelativeAge(90, "fr")).toContain("minute");
	});
});
