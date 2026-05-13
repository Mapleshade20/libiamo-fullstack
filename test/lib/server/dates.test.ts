import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLocalDateString, toSafeUtcDate } from "$lib/server/dates";

describe("getLocalDateString", () => {
	let originalTz: string | undefined;

	beforeAll(() => {
		originalTz = process.env.TZ;
		process.env.TZ = "UTC";
	});

	afterAll(() => {
		process.env.TZ = originalTz;
	});

	it("returns a YYYY-MM-DD date string for a valid timezone", () => {
		const result = getLocalDateString("America/New_York");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("falls back to UTC on invalid timezone", () => {
		const result = getLocalDateString("Not/A_Timezone");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});

describe("toSafeUtcDate", () => {
	it("returns a Date object from a YYYY-MM-DD string", () => {
		const result = toSafeUtcDate("2026-01-15");
		expect(result).toBeInstanceOf(Date);
		expect(result.getUTCHours()).toBe(12);
		expect(result.getUTCMinutes()).toBe(0);
		expect(result.getUTCSeconds()).toBe(0);
	});

	it("handles month boundaries correctly", () => {
		const result = toSafeUtcDate("2026-12-31");
		expect(result.getUTCFullYear()).toBe(2026);
		expect(result.getUTCMonth()).toBe(11); // December = 11
		expect(result.getUTCDate()).toBe(31);
	});

	it("handles leap year date", () => {
		const result = toSafeUtcDate("2024-02-29");
		expect(result.getUTCMonth()).toBe(1); // February = 1
		expect(result.getUTCDate()).toBe(29);
	});
});
