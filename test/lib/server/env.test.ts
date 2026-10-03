import { describe, expect, it } from "vitest";
import { envFlag } from "$lib/server/env";

describe("envFlag", () => {
	it("reads 1/0 and the word forms alike", () => {
		for (const value of ["1", "true", "TRUE", " yes ", "on"]) expect(envFlag(value, false)).toBe(true);
		for (const value of ["0", "false", "No", "off"]) expect(envFlag(value, true)).toBe(false);
	});

	it("falls back when unset or unrecognised", () => {
		expect(envFlag(undefined, true)).toBe(true);
		expect(envFlag("", false)).toBe(false);
		expect(envFlag("maybe", true)).toBe(true);
	});
});
