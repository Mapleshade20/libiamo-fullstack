import { expect, it } from "vitest";
import { formatTime, getTodayDateString } from "$lib/components/utils/messageUtils";
import { isDisplayDay } from "$lib/display-clock";

it("uses the serialized instant and timezone across a UTC midnight", () => {
	const clock = { now: Date.parse("2026-09-04T00:30:00Z"), timeZone: "America/Los_Angeles" };
	expect(getTodayDateString("en", clock)).toBe("September 3, 2026");
	expect(getTodayDateString("en", { ...clock, timeZone: "UTC" })).toBe("September 4, 2026");
	expect(isDisplayDay("2026-09-03T19:00:00Z", clock)).toBe(true);
	expect(isDisplayDay("2026-09-04T19:00:00Z", clock)).toBe(false);
	expect(formatTime(new Date(clock.now), clock.timeZone)).toBe("05:30 PM");
});
