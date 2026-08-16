import { describe, expect, it } from "vitest";
import {
	buildCorrectionVerifierMessages,
	buildGeneration1Messages,
	buildGeneration2Messages,
	buildSecondDraftVerifierMessages,
	type Generation1Input,
} from "$lib/server/translation-evaluation/prompt";
import { Generation1Schema } from "$lib/server/translation-evaluation/schema";
import { validateGeneration1Evaluation } from "$lib/server/translation-evaluation/validation";

const input: Generation1Input = {
	sourceParagraphs: ["我不同意。"],
	learnerParagraphs: ["I am not agree."],
	referenceParagraphs: ["I disagree."],
	sourceLanguage: "zh",
	targetLanguage: "en",
	feedbackLanguage: "zh",
	context: "非正式讨论",
};

const validatedCard = {
	ordinal: 0,
	sourceText: "我不同意。",
	originalAnswer: "I am not agree.",
	initialHint: "注意 agree 的词性。",
	deeperHint: "不需要 be 动词。",
	referenceAnswer: "I disagree.",
	referenceMarked: "I <mark>disagree</mark>.",
	minimalAnswer: "I do not agree.",
	minimalDiff: "I <replace><from>am not agree</from><to>do not agree</to></replace>.",
	teacherNotes: ["你把 agree 当成了形容词；它本身是动词，因此不需要 be，例如 I agree with you。"],
	sourceRange: { start: 0, end: 5 },
	answerRange: { start: 0, end: 15 },
	minimalDiffParts: [],
	referenceMarkedParts: [
		{ type: "text" as const, content: "I " },
		{ type: "mark" as const, content: "disagree" },
		{ type: "text" as const, content: "." },
	],
	warnings: [],
};

const history = [
	{ role: "system" as const, content: "generation system" },
	{ role: "user" as const, content: "generation task" },
	{ role: "assistant" as const, content: "generation result" },
];

describe("translation evaluation prompt builders", () => {
	it("builds a valid fixed Generation 1 conversation and real-task payload", () => {
		const messages = buildGeneration1Messages(input);
		expect(messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user", "assistant", "user"]);

		const examples = messages
			.filter((message) => message.role === "assistant")
			.map((message) => Generation1Schema.parse(JSON.parse(message.content)));
		expect(examples).toHaveLength(2);
		expect(examples[1].cards).toEqual([]);

		const multiIssueTask = JSON.parse(messages[1].content).task as {
			paragraphs: Array<{ source: string; learnerAnswer: string }>;
		};
		const validatedExample = validateGeneration1Evaluation(examples[0], {
			sourceParagraphs: multiIssueTask.paragraphs.map((paragraph) => paragraph.source),
			learnerParagraphs: multiIssueTask.paragraphs.map((paragraph) => paragraph.learnerAnswer),
		});
		expect(examples[0].cards.length).toBeGreaterThan(1);
		expect(validatedExample.cards.map((card) => card.warnings)).toEqual([[], [], []]);
		expect(examples[0].cards.map((card) => card.teacherNotes.length)).toEqual([2, 2, 4]);
		expect(examples[0].cards.every((card) => card.referenceMarked.includes("<mark>"))).toBe(true);

		const realTask = JSON.parse(messages.at(-1)?.content ?? "{}");
		expect(realTask).toEqual({
			kind: "real_task",
			task: {
				sourceLanguage: "Chinese",
				targetLanguage: "English",
				feedbackLanguage: "Chinese",
				context: input.context,
				paragraphs: [{ paragraphIndex: 0, source: "我不同意。", learnerAnswer: "I am not agree.", authenticReference: "I disagree." }],
			},
		});
	});

	it("builds the correction verifier from one complete selected-card payload", () => {
		const messages = buildCorrectionVerifierMessages({
			card: validatedCard,
			learnerRevision: "I disagree.",
			displayedHint: validatedCard.initialHint,
			targetLanguage: "en",
			feedbackLanguage: "zh",
		});
		expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
		expect(JSON.parse(messages[1].content)).toEqual({
			cardOrdinal: 0,
			sourceText: validatedCard.sourceText,
			originalAnswer: validatedCard.originalAnswer,
			referenceAnswer: validatedCard.referenceAnswer,
			teacherNotes: validatedCard.teacherNotes,
			displayedHint: validatedCard.initialHint,
			learnerRevision: "I disagree.",
			initialHint: validatedCard.initialHint,
			deeperHint: validatedCard.deeperHint,
			minimalAnswer: validatedCard.minimalAnswer,
		});
	});

	it("builds structured second-draft and Generation 2 payloads", () => {
		const secondDraft = buildSecondDraftVerifierMessages({
			generation1History: history,
			secondDraftParagraphs: ["I disagree."],
			cardCount: 1,
			cardOutcomes: [{ ordinal: 0, outcome: "passed" }],
			targetLanguage: "en",
			feedbackLanguage: "ja",
		});
		expect(secondDraft.slice(0, history.length)).toEqual(history);
		expect(JSON.parse(secondDraft.at(-1)?.content ?? "{}")).toEqual({
			cardCount: 1,
			cardOutcomes: [{ ordinal: 0, outcome: "passed" }],
			secondDraftParagraphs: ["I disagree."],
		});

		const generation2 = buildGeneration2Messages({ cards: [validatedCard], sourceLanguage: "zh", targetLanguage: "en" });
		expect(generation2.map((message) => message.role)).toEqual(["system", "user"]);
		expect(JSON.parse(generation2[1].content)).toEqual({
			cards: [
				{
					ordinal: 0,
					sourceText: validatedCard.sourceText,
					originalAnswer: validatedCard.originalAnswer,
					referenceAnswer: validatedCard.referenceAnswer,
					minimalAnswer: validatedCard.minimalAnswer,
					teacherNotes: validatedCard.teacherNotes,
				},
			],
		});
	});
});
