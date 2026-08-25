import { describe, expect, it } from "vitest";
import { getBrowserTimezone } from "$lib/server/browser-timezone";

describe("getBrowserTimezone", () => {
	it("returns the browser timezone from the cookie", () => {
		expect(getBrowserTimezone({ get: () => "Asia/Tokyo" })).toBe("Asia/Tokyo");
	});

	it.each([undefined, "Not/A_Timezone"])("falls back to UTC for an invalid cookie value (%s)", (value) => {
		expect(getBrowserTimezone({ get: () => value })).toBe("UTC");
	});
});
