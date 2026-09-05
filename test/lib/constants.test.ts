import { describe, expect, it } from "vitest";
import {
	DEFAULT_SELF_ASSIGNED_LEVELS,
	getLanguageEnglishName,
	getSelfAssignedLevel,
	isLanguageCode,
	isSelfAssignedLevel,
	normalizeSelfAssignedLevels,
	withSelfAssignedLevel,
} from "$lib/constants";

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

describe("isSelfAssignedLevel", () => {
	it("accepts only the three persisted recommendation levels", () => {
		expect(isSelfAssignedLevel(1)).toBe(true);
		expect(isSelfAssignedLevel(2)).toBe(true);
		expect(isSelfAssignedLevel(3)).toBe(true);
		expect(isSelfAssignedLevel(0)).toBe(false);
		expect(isSelfAssignedLevel(4)).toBe(false);
		expect(isSelfAssignedLevel("2")).toBe(false);
	});
});

describe("self-assigned levels by language", () => {
	it("fills every supported language while preserving valid stored levels", () => {
		expect(normalizeSelfAssignedLevels({ en: 1, es: 3, fr: 9 })).toEqual({ en: 1, es: 3, fr: 2, ja: 2 });
		expect(normalizeSelfAssignedLevels(undefined)).toEqual(DEFAULT_SELF_ASSIGNED_LEVELS);
	});

	it("reads and updates one language without changing the others", () => {
		const levels = { en: 1, es: 2, fr: 3, ja: 1 };

		expect(getSelfAssignedLevel(levels, "fr")).toBe(3);
		expect(withSelfAssignedLevel(levels, "es", 3)).toEqual({ en: 1, es: 3, fr: 3, ja: 1 });
	});
});
