import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLocalDateString } from "$lib/server/scheduling/dates";

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

	it("formats an explicit instant in the requested timezone", () => {
		expect(getLocalDateString("Pacific/Auckland", new Date("2026-08-31T19:00:00.000Z"))).toBe("2026-09-01");
	});
});
