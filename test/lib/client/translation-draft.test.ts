import { describe, expect, it } from "vitest";
import { parseTranslationDraft, serializeTranslationDraft, translationDraftStorageKey } from "$lib/client/translation-draft";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";

const fallback = [
	{ paragraphIndex: 0, translation: "", candidateIndex: 0 },
	{ paragraphIndex: 1, translation: "", candidateIndex: 1 },
];

describe("translation session draft", () => {
	it("uses an attempt-scoped sessionStorage key", () => {
		expect(translationDraftStorageKey(42)).toBe("translation-draft:42");
	});

	it("round-trips valid answers", () => {
		const answers = [
			{ paragraphIndex: 0, translation: "Bonjour.", candidateIndex: 2 },
			{ paragraphIndex: 1, translation: "A bientot.", candidateIndex: 0 },
		];
		expect(parseTranslationDraft(serializeTranslationDraft(answers), fallback, [3, 3])).toEqual(answers);
	});

	it("ignores malformed, incomplete, and stale candidate data", () => {
		expect(parseTranslationDraft("not json", fallback, [3, 3])).toBe(fallback);
		expect(
			parseTranslationDraft(serializeTranslationDraft([{ paragraphIndex: 0, translation: "Bonjour.", candidateIndex: 0 }]), fallback, [3, 3]),
		).toBe(fallback);
		expect(
			parseTranslationDraft(
				serializeTranslationDraft([
					{ paragraphIndex: 0, translation: "Bonjour.", candidateIndex: 3 },
					{ paragraphIndex: 1, translation: "A bientot.", candidateIndex: 0 },
				]),
				fallback,
				[3, 3],
			),
		).toBe(fallback);
	});

	it("rejects oversized translations", () => {
		const raw = serializeTranslationDraft([
			{ paragraphIndex: 0, translation: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1), candidateIndex: 0 },
			{ paragraphIndex: 1, translation: "A bientot.", candidateIndex: 0 },
		]);
		expect(parseTranslationDraft(raw, fallback, [3, 3])).toBe(fallback);
	});
});
