import { describe, expect, it } from "vitest";
import { isCalendarMonth, shiftCalendarMonth } from "$lib/month";

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
});
