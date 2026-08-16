import { describe, expect, it } from "vitest";
import { type PersistedReview, parseLiveDemoTemperature, parsePersistedReview } from "$routes/(app)/translate-eval-live-demo/session";

const persistedReview = {
	version: 7,
	learnerParagraphs: ["First.", "Second.", "Third."],
	promptMessages: [{ role: "system", content: "Complete Generation 1 prompt" }],
	rawResponse: '{"cards":[]}',
	metadata: {
		temperature: 0.4,
		model: "test-model",
		finishReason: "stop",
		usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
		durationMs: 1234,
		repairUsed: false,
	},
	evaluation: {
		overallCommentary: "Restored evaluation",
		ratings: { accuracy: "A", naturalness: "B", grammar: "C", overall: "F" },
		cards: [
			{
				ordinal: 0,
				sourceText: "原文。",
				originalAnswer: "Original.",
				initialHint: "Initial hint",
				deeperHint: "Deeper hint",
				referenceAnswer: "Reference.",
				referenceMarked: [
					{ type: "mark", content: "Reference" },
					{ type: "text", content: "." },
				],
				minimalAnswer: "Minimal.",
				minimalDiff: [{ type: "replace", from: "Original", to: "Minimal" }],
				teacherNotes: ["One complete lesson for this issue."],
				warnings: [],
			},
		],
		firstDraft: "First.\n\nSecond.\n\nThird.",
		firstDraftParagraphs: ["First.", "Second.", "Third."],
		sourceParagraphs: ["第一。", "第二。", "第三。"],
	},
	reviewView: "card",
	cardIndex: 0,
	revealGeneratedAnswers: true,
	generation2Call: {
		promptMessages: [
			{ role: "system", content: "Generation 2 contract" },
			{ role: "user", content: '{"cards":[{"ordinal":0}]}' },
		],
		rawResponse: '{"notes":[]}',
		metadata: {
			temperature: 0.6,
			model: "test-model",
			finishReason: "stop",
			usage: { promptTokens: 30, completionTokens: 40, totalTokens: 70 },
			durationMs: 2345,
			repairUsed: false,
		},
		result: {
			notes: [
				{
					sourceCardOrdinals: [0],
					vocab: "even",
					targetDefinition: "used for emphasis",
					nativeDefinition: "甚至；到底",
					examples: [
						{ nativeText: "练习一。", targetText: "Even example one." },
						{ nativeText: "练习二。", targetText: "Even example two." },
						{ nativeText: "练习三。", targetText: "Even example three." },
						{ nativeText: "练习四。", targetText: "Even example four." },
					],
				},
			],
		},
	},
} satisfies PersistedReview;

describe("live translation review session", () => {
	it("restores the complete review state from valid session JSON", () => {
		expect(parsePersistedReview(JSON.stringify(persistedReview), 3)).toEqual(persistedReview);
	});

	it("accepts only live-demo temperatures in the configured range", () => {
		expect(parseLiveDemoTemperature("0")).toBe(0);
		expect(parseLiveDemoTemperature("0.4")).toBe(0.4);
		expect(parseLiveDemoTemperature("1")).toBe(1);
		expect(parseLiveDemoTemperature("1.1")).toBeNull();
		expect(parseLiveDemoTemperature("not-a-number")).toBeNull();
	});

	it("rejects malformed or incompatible session state", () => {
		expect(parsePersistedReview("not json", 3)).toBeNull();
		expect(parsePersistedReview(JSON.stringify({ ...persistedReview, version: 4 }), 3)).toBeNull();
		expect(parsePersistedReview(JSON.stringify(persistedReview), 2)).toBeNull();
		expect(
			parsePersistedReview(
				JSON.stringify({
					...persistedReview,
					evaluation: { ...persistedReview.evaluation, ratings: { ...persistedReview.evaluation.ratings, overall: "D" } },
				}),
				3,
			),
		).toBeNull();
		expect(
			parsePersistedReview(
				JSON.stringify({
					...persistedReview,
					evaluation: { ...persistedReview.evaluation, ratings: { ...persistedReview.evaluation.ratings, overall: "A-" } },
				}),
				3,
			),
		).toBeNull();
		expect(
			parsePersistedReview(
				JSON.stringify({
					...persistedReview,
					evaluation: {
						...persistedReview.evaluation,
						ratings: { ...persistedReview.evaluation.ratings, register: "A" },
					},
				}),
				3,
			),
		).toBeNull();
		expect(parsePersistedReview(JSON.stringify({ ...persistedReview, metadata: { ...persistedReview.metadata, temperature: 1.1 } }), 3)).toBeNull();
		expect(
			parsePersistedReview(
				JSON.stringify({
					...persistedReview,
					generation2Call: {
						...persistedReview.generation2Call,
						result: {
							notes: [
								{
									...persistedReview.generation2Call.result.notes[0],
									examples: persistedReview.generation2Call.result.notes[0].examples.slice(0, 3),
								},
							],
						},
					},
				}),
				3,
			),
		).toBeNull();
		expect(parsePersistedReview(JSON.stringify({ ...persistedReview, generation2Call: undefined }), 3)).toBeNull();
	});
});
