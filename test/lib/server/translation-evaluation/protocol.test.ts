import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockChatJson } = vi.hoisted(() => ({ mockChatJson: vi.fn() }));
vi.mock("$lib/server/llm", () => ({ chatJson: mockChatJson }));

import { generateTranslationEvaluation } from "$lib/server/translation-evaluation/generation";
import { generateTranslationPractice } from "$lib/server/translation-evaluation/practice-generation";
import { verifyCorrection, verifySecondDraft } from "$lib/server/translation-evaluation/verifier";

const rawCard = {
	sourceText: "我不同意。",
	originalAnswer: "I am not agree.",
	initialHint: "注意词性。",
	deeperHint: "不需要 be。",
	referenceAnswer: "I disagree.",
	referenceMarked: "I <mark>disagree</mark>.",
	minimalAnswer: "I do not agree.",
	minimalDiff: "I <replace><from>am not agree</from><to>do not agree</to></replace>.",
	teacherNotes: ["你把 agree 当成了形容词；它本身是动词，因此不需要 be，例如 I agree with you。"],
};

const rawEvaluation = {
	overallCommentary: "整体意思清楚。",
	ratings: { accuracy: "B", naturalness: "B", grammar: "B", overall: "B" },
	cards: [rawCard],
};

const passingCorrectionChecks = {
	allCardIssuesResolved: true,
	noNewErrors: true,
	fullyNatural: true,
};

function response(value: unknown) {
	return {
		value,
		content: JSON.stringify(value),
		requestMessages: [
			{ role: "system", content: "system" },
			{ role: "user", content: "task" },
		],
		finishReason: "stop",
		raw: {},
	};
}

beforeEach(() => vi.clearAllMocks());

describe("translation evaluation model protocols", () => {
	it("returns validated Gen1 data and the exact successful conversation", async () => {
		mockChatJson.mockResolvedValue(response(rawEvaluation));
		const result = await generateTranslationEvaluation({
			sourceParagraphs: ["我不同意。"],
			learnerParagraphs: ["I am not agree."],
			referenceParagraphs: ["I disagree."],
			sourceLanguage: "zh",
			targetLanguage: "en",
			feedbackLanguage: "zh",
			context: "讨论",
			userId: "user-1",
		});
		expect(result.value.cards[0]).toMatchObject({ ordinal: 0, warnings: [] });
		expect(result.history.at(-1)).toEqual({ role: "assistant", content: JSON.stringify(rawEvaluation) });
		expect(mockChatJson).toHaveBeenCalledWith(
			expect.objectContaining({ userId: "user-1", schema: expect.anything(), options: { temperature: 0.4, maxTokens: 32_768 } }),
		);
	});

	it("verifies a correction with only the selected card context", async () => {
		mockChatJson.mockResolvedValue(response({ verdict: "accept", checks: passingCorrectionChecks, acceptedDiff: "<add>fixed</add>" }));
		const result = await verifyCorrection({
			card: {
				...rawCard,
				ordinal: 0,
				sourceRange: null,
				answerRange: null,
				minimalDiffParts: [],
				referenceMarkedParts: [
					{ type: "text", content: "I " },
					{ type: "mark", content: "disagree" },
					{ type: "text", content: "." },
				],
				warnings: [],
			},
			learnerRevision: "I disagree.",
			displayedHint: rawCard.initialHint,
			targetLanguage: "en",
			feedbackLanguage: "zh",
		});
		expect(result.value.verdict).toBe("accept");
		if (result.value.verdict === "accept") expect(result.value.acceptedDiffParts).not.toBeNull();
		const request = mockChatJson.mock.calls[0][0];
		expect(request.messages).toHaveLength(2);
		expect(JSON.parse(request.messages[1].content)).toMatchObject({ cardOrdinal: 0, learnerRevision: "I disagree." });
		expect(request.options).toEqual({ temperature: 0.2 });
	});

	it("sorts complete second-draft ordinals and rejects incomplete output", async () => {
		const generation1History = [{ role: "assistant" as const, content: "evaluation" }];
		mockChatJson.mockResolvedValueOnce(
			response({
				cards: [
					{ ordinal: 1, resolved: false },
					{ ordinal: 0, resolved: true },
				],
				commentary: "还有一处问题。",
			}),
		);
		const result = await verifySecondDraft({
			generation1History,
			secondDraftParagraphs: ["Draft"],
			cardCount: 2,
			cardOutcomes: [
				{ ordinal: 0, outcome: "passed" },
				{ ordinal: 1, outcome: "revealed" },
			],
			targetLanguage: "en",
			feedbackLanguage: "zh",
		});
		expect(result.value.cards.map((card) => card.ordinal)).toEqual([0, 1]);
		expect(mockChatJson.mock.calls[0][0].options).toEqual({ temperature: 0.2 });
	});

	it("validates Gen2 coverage before returning", async () => {
		const exercises = Array.from({ length: 4 }, (_, index) => ({ front: `句子 ${index}`, back: `Sentence ${index}` }));
		mockChatJson.mockResolvedValue(
			response({ notes: [{ sourceCardOrdinals: [0], targetPattern: "disagree", explanation: "表达不同意。", exercises }] }),
		);
		const result = await generateTranslationPractice({
			cards: [
				{
					...rawCard,
					ordinal: 0,
					sourceRange: null,
					answerRange: null,
					minimalDiffParts: [],
					referenceMarkedParts: [
						{ type: "text", content: "I " },
						{ type: "mark", content: "disagree" },
						{ type: "text", content: "." },
					],
					warnings: [],
				},
			],
			sourceLanguage: "zh",
			targetLanguage: "en",
			feedbackLanguage: "zh",
		});
		expect(result.value.notes[0].exercises).toHaveLength(4);
		expect(mockChatJson.mock.calls[0][0].options).toEqual({ temperature: 0.6, maxTokens: 32_768 });
	});

	it("rejects invalid verifier and Gen2 inputs before calling the provider", async () => {
		await expect(
			verifySecondDraft({
				generation1History: [{ role: "assistant", content: "evaluation" }],
				secondDraftParagraphs: ["Draft"],
				cardCount: 2,
				cardOutcomes: [
					{ ordinal: 0, outcome: "passed" },
					{ ordinal: 0, outcome: "revealed" },
				],
				targetLanguage: "en",
				feedbackLanguage: "zh",
			}),
		).rejects.toThrow("must cover every card ordinal exactly once");

		await expect(generateTranslationPractice({ cards: [], sourceLanguage: "zh", targetLanguage: "en", feedbackLanguage: "zh" })).rejects.toThrow(
			"at least one correction card",
		);
		expect(mockChatJson).not.toHaveBeenCalled();
	});
});
