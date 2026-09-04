import { describe, expect, it } from "vitest";
import { formatCalendarMonth, isCalendarMonth, shiftCalendarMonth } from "$lib/month";

describe("calendar month helpers", () => {
	it("validates YYYY-MM values", () => {
		expect(isCalendarMonth("2026-04")).toBe(true);
		expect(isCalendarMonth("2026-13")).toBe(false);
		expect(isCalendarMonth("April 2026")).toBe(false);
	});

	it("shifts across year boundaries", () => {
		expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
		expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
	});

	it("formats a calendar month in the requested locale", () => {
		expect(formatCalendarMonth("2026-09", "en")).toBe("September 2026");
		expect(formatCalendarMonth("2026-09", "fr")).toBe("septembre 2026");
		expect(() => formatCalendarMonth("2026-13", "en")).toThrow("Invalid calendar month");
	});
});
