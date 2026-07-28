import { describe, expect, it } from "vitest";
import {
	assignNonOverlappingRanges,
	TranslationEvaluationContractError,
	validateGeneration1Evaluation,
	validateGeneration2Result,
	validateSecondDraftVerification,
} from "$lib/server/translation-evaluation/validation";

const card = {
	sourceText: "原文",
	originalAnswer: "short",
	initialHint: "提示",
	deeperHint: "更多提示",
	referenceAnswer: "better",
	referenceMarked: "<mark>better</mark>",
	minimalAnswer: "better",
	minimalDiff: "<replace><from>short</from><to>better</to></replace>",
	teacherNotes: ["你写的表达有一个需要处理的问题，并可在同一条讲解中结合例子说明。"],
};

const ratings = {
	accuracy: "B" as const,
	naturalness: "B" as const,
	grammar: "B" as const,
	overall: "B" as const,
};

describe("translation evaluation validation", () => {
	it("allocates exact matches longest-first without overlap", () => {
		expect(assignNonOverlappingRanges("short longer short", ["short", "longer short"])).toEqual([
			{ start: 0, end: 5 },
			{ start: 6, end: 18 },
		]);
	});

	it("derives ordinals, ranges, and soft warnings without rejecting the evaluation", () => {
		const result = validateGeneration1Evaluation(
			{ overallCommentary: "反馈", ratings, cards: [card, card, { ...card, sourceText: "不存在", originalAnswer: "missing" }] },
			{ sourceParagraphs: ["原文 原文"], learnerParagraphs: ["short and short"] },
		);

		expect(result.cards.map((item) => item.ordinal)).toEqual([0, 1, 2]);
		expect(result.cards[0].warnings).toContain("duplicate");
		expect(result.cards[1].warnings).toContain("duplicate");
		expect(result.cards[2].warnings).toEqual(["source_unmatched", "answer_unmatched"]);
		expect(result.cards[0].minimalDiffParts).not.toBeNull();
		expect(result.cards[0].referenceMarkedParts).toEqual([{ type: "mark", content: "better" }]);
	});

	it("keeps syntactically valid reference markup without comparing its plain text to referenceAnswer", () => {
		const changedResult = validateGeneration1Evaluation(
			{
				overallCommentary: "反馈",
				ratings,
				cards: [{ ...card, referenceMarked: "<mark>different</mark>" }],
			},
			{ sourceParagraphs: ["原文"], learnerParagraphs: ["short"] },
		);
		expect(changedResult.cards[0].referenceMarkedParts).toEqual([{ type: "mark", content: "different" }]);
		expect(changedResult.cards[0].warnings).toEqual([]);

		const unmarkedResult = validateGeneration1Evaluation(
			{
				overallCommentary: "反馈",
				ratings,
				cards: [{ ...card, referenceMarked: "different" }],
			},
			{ sourceParagraphs: ["原文"], learnerParagraphs: ["short"] },
		);
		expect(unmarkedResult.cards[0].referenceMarkedParts).toEqual([{ type: "text", content: "different" }]);
		expect(unmarkedResult.cards[0].warnings).toEqual([]);
	});

	it("falls back to referenceAnswer only when referenceMarked cannot be parsed", () => {
		const result = validateGeneration1Evaluation(
			{
				overallCommentary: "反馈",
				ratings,
				cards: [{ ...card, referenceMarked: "<mark>open" }],
			},
			{ sourceParagraphs: ["原文"], learnerParagraphs: ["short"] },
		);
		expect(result.cards[0].referenceMarkedParts).toBeNull();
		expect(result.cards[0].warnings).toEqual(["reference_marked_invalid"]);
	});

	it("turns malformed model Diffs into warnings and null AST fallbacks", () => {
		const result = validateGeneration1Evaluation(
			{
				overallCommentary: "反馈",
				ratings,
				cards: [{ ...card, minimalDiff: "<script>bad</script>" }],
			},
			{ sourceParagraphs: ["原文"], learnerParagraphs: ["short"] },
		);
		expect(result.cards[0]).toMatchObject({
			minimalDiffParts: null,
			warnings: ["minimal_diff_invalid"],
		});
	});

	it("keeps every syntactically valid Diff regardless of text matching", () => {
		const result = validateGeneration1Evaluation(
			{
				overallCommentary: "反馈",
				ratings,
				cards: [{ ...card, minimalDiff: "Unrelated <replace><from>valid text</from><to></to></replace>" }],
			},
			{ sourceParagraphs: ["原文"], learnerParagraphs: ["short"] },
		);

		expect(result.cards[0].warnings).toEqual([]);
		expect(result.cards[0].minimalDiffParts).toEqual([
			{ type: "unchanged", text: "Unrelated " },
			{ type: "replace", from: "valid text", to: "" },
		]);
	});

	it("requires exact ordinal coverage for second draft and Gen2", () => {
		expect(
			validateSecondDraftVerification(
				{
					cards: [
						{ ordinal: 1, resolved: false },
						{ ordinal: 0, resolved: true },
					],
					commentary: "反馈",
				},
				2,
			).cards,
		).toEqual([
			{ ordinal: 0, resolved: true },
			{ ordinal: 1, resolved: false },
		]);
		expect(() => validateSecondDraftVerification({ cards: [{ ordinal: 0, resolved: true }], commentary: "反馈" }, 2)).toThrow(
			TranslationEvaluationContractError,
		);

		const examples = Array.from({ length: 4 }, (_, index) => ({ nativeText: `前 ${index}`, targetText: `Back ${index}` }));
		const note = (sourceCardOrdinals: number[], vocab: string) => ({
			sourceCardOrdinals,
			vocab,
			targetDefinition: `${vocab} definition`,
			nativeDefinition: `${vocab} 释义`,
			examples,
		});
		expect(
			validateGeneration2Result(
				{
					notes: [note([0], "one"), note([1], "two")],
				},
				2,
			),
		).toBeDefined();
		expect(() => validateGeneration2Result({ notes: [note([0, 0], "one")] }, 2)).toThrow("cover every card ordinal exactly once");
	});

	it("rejects duplicate examples within a note", () => {
		const examples = Array.from({ length: 4 }, () => ({ nativeText: "同一句", targetText: "Same" }));
		expect(() =>
			validateGeneration2Result(
				{
					notes: [
						{
							sourceCardOrdinals: [0],
							vocab: "same",
							targetDefinition: "identical",
							nativeDefinition: "相同",
							examples,
						},
					],
				},
				1,
			),
		).toThrow("four distinct examples");
	});
});
