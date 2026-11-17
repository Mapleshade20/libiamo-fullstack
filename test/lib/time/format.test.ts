import { expect, it } from "vitest";
import { formatTime, getTodayDateString } from "#lib/components/exchange/message-format.ts";
import { daysBefore, formatDay, formatInstant, weekdayNames, weekdayOf } from "#lib/time/format.ts";

const clock = { now: Date.parse("2026-09-04T00:30:00Z"), timeZone: "America/Los_Angeles" };

it("shows an instant in the learner's zone, whatever zone the code runs in", () => {
	expect(getTodayDateString("en", clock)).toBe("September 3, 2026");
	expect(getTodayDateString("en", { ...clock, timeZone: "UTC" })).toBe("September 4, 2026");
	expect(formatTime(new Date(clock.now), clock.timeZone)).toBe("05:30 PM");
	expect(formatInstant("2026-09-04T00:30:00Z", "en", "Asia/Shanghai", { month: "short", day: "numeric" })).toBe("Sep 4");
	expect(formatInstant(clock.now, "en", clock.timeZone, { month: "short", day: "numeric" })).toBe("Sep 3");
});

it("counts days ago by the learner's calendar, not by 24 hours", () => {
	// 23:00 the day before in Los Angeles, an hour and a half earlier.
	expect(daysBefore("2026-09-03T23:00:00Z", clock)).toBe(0);
	expect(daysBefore("2026-09-03T06:00:00Z", clock)).toBe(1);
	expect(daysBefore("2026-09-03T06:00:00Z", { ...clock, timeZone: "UTC" })).toBe(1);
	expect(daysBefore("2026-09-03T23:00:00Z", { ...clock, timeZone: "UTC" })).toBe(1);
	expect(daysBefore("2026-09-03T23:00:00Z", { ...clock, timeZone: "Asia/Shanghai" })).toBe(0);
});

it("shows a local day as the day it names", () => {
	expect(formatDay("2026-11-16", "en", { month: "short", day: "numeric" })).toBe("Nov 16");
	expect(weekdayOf("2026-11-16")).toBe(0);
	expect(weekdayOf("2026-11-22")).toBe(6);
	expect(weekdayNames("en", "short")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
});
