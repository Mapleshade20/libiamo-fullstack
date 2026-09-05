import { describe, expect, it } from "vitest";
import { getLanguageEnglishName, isLanguageCode } from "$lib/constants";

describe("getLanguageEnglishName", () => {
	it("returns English names for learning languages", () => {
		expect(getLanguageEnglishName("es")).toBe("Spanish");
	});

	it("returns English names for languages outside the learning-language list", () => {
		expect(getLanguageEnglishName("pl")).toBe("Polish");
		expect(getLanguageEnglishName("zh")).toBe("Chinese");
	});

	it("falls back to the input for an invalid language code", () => {
		expect(getLanguageEnglishName("not-a-language")).toBe("not-a-language");
	});
});

describe("isLanguageCode", () => {
	it("accepts supported interface languages only", () => {
		expect(isLanguageCode("ja")).toBe(true);
		expect(isLanguageCode("pl")).toBe(false);
		expect(isLanguageCode(null)).toBe(false);
	});
});
