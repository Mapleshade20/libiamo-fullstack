import { describe, expect, it } from "vitest";
import { formatRelativeAge, unreadTargetHref } from "$lib/unread";

describe("unread helpers", () => {
	it("targets the session page for in-progress conversations and feedback otherwise", () => {
		expect(unreadTargetHref({ taskId: 4, sessionStatus: "in_progress" })).toBe("/task/4/session");
		expect(unreadTargetHref({ taskId: 7, sessionStatus: "completed" })).toBe("/task/7/feedback");
		expect(unreadTargetHref({ taskId: 8, sessionStatus: "evaluated" })).toBe("/task/8/feedback");
	});

	it("formats relative ages across unit boundaries", () => {
		expect(formatRelativeAge(30, "en")).toContain("now");
		expect(formatRelativeAge(90, "en")).toContain("minute");
		expect(formatRelativeAge(90 * 60, "en")).toContain("hour");
		expect(formatRelativeAge(26 * 60 * 60, "en")).toContain("day");
		expect(formatRelativeAge(90, "fr")).toContain("minute");
	});
});
