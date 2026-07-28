import { describe, expect, it } from "vitest";
import { CorrectionVerifierSchema, Generation1Schema, Generation2Schema, SecondDraftVerifierSchema } from "$lib/server/translation-evaluation/schema";

const validEvaluation = {
	overallCommentary: "整体准确，但有一处搭配需要调整。",
	ratings: {
		accuracy: "A",
		naturalness: "B",
		grammar: "C",
		overall: "F",
	},
	cards: [
		{
			sourceText: "我不同意。",
			originalAnswer: "I am not agree.",
			initialHint: "agree 的词性需要注意。",
			deeperHint: "这里不需要 be 动词。",
			referenceAnswer: "I disagree.",
			referenceMarked: "I <mark>disagree</mark>.",
			minimalAnswer: "I do not agree.",
			minimalDiff: "I <replace><from>am not agree</from><to>do not agree</to></replace>.",
			teacherNotes: ["你写的 be agree 混淆了词性；agree 本身是动词，所以应直接使用它，例如 I agree with you。"],
		},
	],
};

describe("translation evaluation schemas", () => {
	it("accepts the complete Generation 1 contract and rejects extra fields or invalid grades", () => {
		expect(Generation1Schema.parse(validEvaluation)).toEqual(validEvaluation);
		expect(Generation1Schema.parse(validEvaluation).cards[0].teacherNotes).toEqual(validEvaluation.cards[0].teacherNotes);
		expect(() => Generation1Schema.parse({ ...validEvaluation, title: "unused" })).toThrow();
		expect(() => Generation1Schema.parse({ ...validEvaluation, ratings: { ...validEvaluation.ratings, overall: "D" } })).toThrow();
		expect(() => Generation1Schema.parse({ ...validEvaluation, ratings: { ...validEvaluation.ratings, overall: "A+" } })).toThrow();
		expect(() => Generation1Schema.parse({ ...validEvaluation, ratings: { ...validEvaluation.ratings, overall: "B-" } })).toThrow();
		expect(() => Generation1Schema.parse({ ...validEvaluation, ratings: { ...validEvaluation.ratings, register: "A" } })).toThrow();
		expect(() =>
			Generation1Schema.parse({
				...validEvaluation,
				cards: [{ ...validEvaluation.cards[0], referenceDiff: "<add>obsolete</add>" }],
			}),
		).toThrow();
		expect(() =>
			Generation1Schema.parse({
				...validEvaluation,
				cards: [{ ...validEvaluation.cards[0], referenceMarked: undefined }],
			}),
		).toThrow();
		expect(() =>
			Generation1Schema.parse({
				...validEvaluation,
				cards: [{ ...validEvaluation.cards[0], teacherNotes: [] }],
			}),
		).toThrow();
	});

	it("requires verdict-specific verifier fields", () => {
		const passingChecks = {
			allCardIssuesResolved: true,
			noNewErrors: true,
			fullyNatural: true,
		};
		expect(
			CorrectionVerifierSchema.parse({ verdict: "reject", checks: { ...passingChecks, noNewErrors: false }, feedback: "语义仍然改变了。" }),
		).toBeDefined();
		expect(CorrectionVerifierSchema.parse({ verdict: "accept", checks: passingChecks, acceptedDiff: "<add>now</add>" })).toBeDefined();
		expect(() =>
			CorrectionVerifierSchema.parse({ verdict: "accept", checks: { ...passingChecks, meaningPreserved: true }, acceptedDiff: "answer" }),
		).toThrow();
		expect(() => CorrectionVerifierSchema.parse({ verdict: "reject", checks: passingChecks, feedback: "不应拒绝。" })).toThrow();
		expect(() =>
			CorrectionVerifierSchema.parse({ verdict: "accept", checks: { ...passingChecks, fullyNatural: false }, acceptedDiff: "answer" }),
		).toThrow();
		expect(() => CorrectionVerifierSchema.parse({ verdict: "reject", acceptedDiff: "answer" })).toThrow();
	});

	it("requires complete second-draft and vocabulary-note Gen2 shapes", () => {
		expect(SecondDraftVerifierSchema.parse({ cards: [{ ordinal: 0, resolved: true }], commentary: "已经解决。" })).toBeDefined();
		const note = {
			sourceCardOrdinals: [0],
			vocab: "disagree",
			targetDefinition: "to have a different opinion",
			nativeDefinition: "不同意；持不同意见",
			examples: Array.from({ length: 4 }, (_, index) => ({ nativeText: `例句 ${index}`, targetText: `I disagree with example ${index}.` })),
		};
		expect(Generation2Schema.parse({ notes: [note] })).toBeDefined();
		expect(() => Generation2Schema.parse({ notes: [{ ...note, examples: note.examples.slice(0, 3) }] })).toThrow();
	});
});
