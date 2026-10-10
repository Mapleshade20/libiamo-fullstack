import { describe, expect, it, vi } from "vitest";
import { disabledLanguages, envFlag } from "$lib/server/env";

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

describe("disabledLanguages", () => {
	it("reads a comma-separated list of learning languages, dropping unknown codes", () => {
		expect(disabledLanguages(" ES, ja,xx,es ")).toEqual(["es", "ja"]);
		expect(disabledLanguages(undefined)).toEqual([]);
	});

	it("never disables every language", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(disabledLanguages("en,es,fr,ja")).toEqual([]);
		warn.mockRestore();
	});
});
