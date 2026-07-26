import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectQueue, mockDb, mockEvaluate, mockGetSourceSet, mockGetAttempt, mockFollowUp, mockCreateSelectionNotes, mockCreateQaNote } = vi.hoisted(
	() => {
		const selectQueue: unknown[][] = [];
		const makeSelectChain = (value: unknown[]) => {
			const chain = Promise.resolve(value) as Promise<unknown[]> & Record<string, ReturnType<typeof vi.fn>>;
			chain.from = vi.fn(() => chain);
			chain.innerJoin = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.orderBy = vi.fn(() => chain);
			chain.limit = vi.fn(() => chain);
			return chain;
		};
		const makeWriteChain = () => {
			const chain = Promise.resolve([] as unknown[]) as unknown as Promise<unknown[]> & Record<string, ReturnType<typeof vi.fn>>;
			chain.set = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.returning = vi.fn(() => Promise.resolve([{ id: 9 }]));
			return chain;
		};
		const mockDb = {
			select: vi.fn(() => makeSelectChain(selectQueue.shift() ?? [])),
			update: vi.fn(() => makeWriteChain()),
			transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(mockDb)),
		};
		return {
			selectQueue,
			mockDb,
			mockEvaluate: vi.fn(),
			mockGetSourceSet: vi.fn(),
			mockGetAttempt: vi.fn(),
			mockFollowUp: vi.fn(),
			mockCreateSelectionNotes: vi.fn(),
			mockCreateQaNote: vi.fn(),
		};
	},
);

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/db/schema", () => ({
	template: {
		id: "template.id",
		titleBase: "template.titleBase",
		descriptionBase: "template.descriptionBase",
		language: "template.language",
		materialsMd: "template.materialsMd",
		translationReference: "template.translationReference",
		agentPromptBase: "template.agentPromptBase",
		difficulty: "template.difficulty",
		estimatedWords: "template.estimatedWords",
		pointReward: "template.pointReward",
		gemReward: "template.gemReward",
		interactionType: "template.interactionType",
		isActive: "template.isActive",
	},
	translationSourceSet: {
		id: "sourceSet.id",
		templateId: "sourceSet.templateId",
		candidates: "sourceSet.candidates",
		referenceParagraphs: "sourceSet.referenceParagraphs",
		context: "sourceSet.context",
		sourceLanguage: "sourceSet.sourceLanguage",
		promptLanguage: "sourceSet.promptLanguage",
	},
	translationAttempt: {
		id: "attempt.id",
		userId: "attempt.userId",
		sourceSetId: "attempt.sourceSetId",
		status: "attempt.status",
		evaluation: "attempt.evaluation",
		updatedAt: "attempt.updatedAt",
		submittedAt: "attempt.submittedAt",
		evaluatedAt: "attempt.evaluatedAt",
	},
	translationAnswer: {
		attemptId: "answer.attemptId",
		paragraphIndex: "answer.paragraphIndex",
		translation: "answer.translation",
		candidateIndex: "answer.candidateIndex",
		updatedAt: "answer.updatedAt",
	},
}));
vi.mock("drizzle-orm", () => ({
	and: vi.fn((...conditions) => conditions),
	desc: vi.fn((value) => value),
	eq: vi.fn((column, value) => ({ column, value })),
}));
vi.mock("$lib/server/translation", () => ({
	evaluateTranslationAgainstReferences: mockEvaluate,
	getOrCreateTranslationSourceSet: mockGetSourceSet,
	getOrCreateTranslationAttempt: mockGetAttempt,
}));
vi.mock("$lib/server/feedback", () => ({ followUpOnLearningContent: mockFollowUp }));
vi.mock("$lib/server/note", () => ({
	createNotesFromSelectionBatch: mockCreateSelectionNotes,
	createNoteFromSelectionQA: mockCreateQaNote,
}));

import { actions, load } from "$routes/(app)/translate/[id]/+page.server";

const templateRecord = {
	id: 1,
	title: "A Letter",
	description: "Translate it",
	language: "fr",
	materialsMd: null,
	translationReference: ["Bonjour tout le monde.", "A bientot."],
	context: "a warm note to old friends",
	difficulty: 2,
	estimatedWords: 20,
	pointReward: 10,
	gemReward: 2,
};

const attemptRecord = {
	id: 9,
	status: "draft" as const,
	evaluation: null,
	sourceSetId: 4,
	candidates: [
		["Hello everyone.", "Hi everybody.", "Greetings, all."],
		["See you soon.", "Until next time.", "Talk soon."],
	],
	referenceParagraphs: templateRecord.translationReference,
	context: templateRecord.context,
	sourceLanguage: "fr",
	promptLanguage: "en",
};

const answerRows = [
	{ paragraphIndex: 0, translation: "", candidateIndex: 0 },
	{ paragraphIndex: 1, translation: "", candidateIndex: 1 },
];

function event(
	entries: Record<string, string> = {},
	user: Record<string, unknown> | null = { id: "u1", activeLanguage: "fr", nativeLanguage: "en" },
) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) formData.set(key, value);
	return {
		locals: { user },
		params: { id: "1" },
		request: { formData: vi.fn().mockResolvedValue(formData) },
	} as any;
}

function answersPayload(translations = ["Salut a tous.", "A bientot."]) {
	return JSON.stringify(translations.map((translation, paragraphIndex) => ({ paragraphIndex, translation, candidateIndex: paragraphIndex })));
}

describe("translation page server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectQueue.length = 0;
	});

	it("redirects unauthenticated users", async () => {
		await expect(load(event({}, null))).rejects.toMatchObject({ status: 302, location: "/sign-in" });
	});

	it("blocks preparation when native language is missing", async () => {
		selectQueue.push([templateRecord]);
		const result = (await load(event({}, { id: "u1", activeLanguage: "fr", nativeLanguage: null }))) as any;
		expect(result.blockedReason).toBe("missing-native-language");
		expect(result.template).not.toHaveProperty("translationReference");
	});

	it("does not expose authentic references for a draft", async () => {
		selectQueue.push(
			[templateRecord],
			[attemptRecord],
			answerRows.map((answer) => ({ ...answer, translation: "legacy remote draft" })),
		);
		const result = (await load(event())) as any;
		expect(result.prepared).toBe(true);
		expect(result.attempt.referenceParagraphs).toBeNull();
		expect(result.attempt.candidates).toEqual(attemptRecord.candidates);
		expect(result.attempt.answers.every((answer: { translation: string }) => answer.translation === "")).toBe(true);
	});

	it("reveals authentic references after submission", async () => {
		selectQueue.push([templateRecord], [{ ...attemptRecord, status: "submitted" }], answerRows);
		const result = (await load(event())) as any;
		expect(result.attempt.referenceParagraphs).toEqual(templateRecord.translationReference);
	});

	it("returns an unprepared state without calling a generator on GET", async () => {
		selectQueue.push([templateRecord], []);
		const result = (await load(event())) as any;
		expect(result.prepared).toBe(false);
		expect(mockGetSourceSet).not.toHaveBeenCalled();
	});

	it("prepare uses the source snapshot service and creates one attempt", async () => {
		selectQueue.push([templateRecord]);
		mockGetSourceSet.mockResolvedValue({ id: 4, candidates: attemptRecord.candidates });
		mockGetAttempt.mockResolvedValue(9);
		const result = await actions.prepare(event());
		expect(result).toEqual({ success: true, attemptId: 9 });
		expect(mockGetSourceSet).toHaveBeenCalledWith(expect.objectContaining({ sourceLanguage: "fr", promptLanguage: "en" }));
		expect(mockGetAttempt).toHaveBeenCalledWith("u1", 4, 2);
	});

	it("does not expose a remote draft-saving action", () => {
		expect(actions.saveDraft).toBeUndefined();
	});

	it("rejects malformed candidate indices on submit", async () => {
		const result = (await actions.submit(
			event({ attemptId: "9", answers: answersPayload().replace('"candidateIndex":1', '"candidateIndex":3') }),
		)) as any;
		expect(result.status).toBe(400);
		expect(mockDb.transaction).not.toHaveBeenCalled();
	});

	it("enforces attempt ownership", async () => {
		selectQueue.push([]);
		const result = (await actions.submit(event({ attemptId: "9", answers: answersPayload() }))) as any;
		expect(result.status).toBe(403);
	});

	it("requires complete paragraph coverage on submit", async () => {
		selectQueue.push([attemptRecord]);
		const incomplete = JSON.stringify([{ paragraphIndex: 0, translation: "Salut", candidateIndex: 0 }]);
		const result = (await actions.submit(event({ attemptId: "9", answers: incomplete }))) as any;
		expect(result.status).toBe(400);
	});

	it("submits transactionally before evaluating", async () => {
		const submittedRecord = { ...attemptRecord, status: "submitted" as const };
		const completedAnswers = answerRows.map((answer, index) => ({ ...answer, translation: index ? "A bientot." : "Salut a tous." }));
		selectQueue.push([attemptRecord], [submittedRecord], completedAnswers);
		mockEvaluate.mockResolvedValue({ overallScore: "A", overallFeedback: "Good", paragraphs: [] });
		const result = await actions.submit(event({ attemptId: "9", answers: answersPayload() }));
		expect(result).toMatchObject({ success: true });
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		expect(mockEvaluate).toHaveBeenCalledWith(expect.objectContaining({ feedbackLanguage: "en", targetLanguage: "fr", userId: "u1" }));
	});

	it("keeps the submitted state when Tutor evaluation fails", async () => {
		const submittedRecord = { ...attemptRecord, status: "submitted" as const };
		const completedAnswers = answerRows.map((answer, index) => ({ ...answer, translation: index ? "A bientot." : "Salut a tous." }));
		selectQueue.push([attemptRecord], [submittedRecord], completedAnswers);
		mockEvaluate.mockRejectedValue(new Error("Tutor unavailable"));
		const result = (await actions.submit(event({ attemptId: "9", answers: answersPayload() }))) as any;
		expect(result.status).toBe(500);
		expect(result.data.submitted).toBe(true);
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
	});

	it("retry evaluation does not save answers or recount votes", async () => {
		const submittedRecord = { ...attemptRecord, status: "submitted" as const };
		const completedAnswers = answerRows.map((answer, index) => ({ ...answer, translation: index ? "A bientot." : "Salut a tous." }));
		selectQueue.push([submittedRecord], completedAnswers);
		mockEvaluate.mockResolvedValue({ overallScore: "B", overallFeedback: "Good", paragraphs: [] });
		const result = await actions.retryEvaluation(event({ attemptId: "9" }));
		expect(result).toMatchObject({ success: true });
		expect(mockDb.transaction).not.toHaveBeenCalled();
	});

	it("saves selected evaluation text as translation notes", async () => {
		selectQueue.push([{ ...attemptRecord, status: "evaluated", evaluation: { overallScore: "A", overallFeedback: "Good", paragraphs: [] } }]);
		mockCreateSelectionNotes.mockResolvedValue({ count: 1, notes: [{ id: 3 }], reason: null });
		const result = await actions.saveSelectionNotes(
			event({
				attemptId: "9",
				selectedText: "subjunctive form",
				currentContext: "Tutor feedback about the subjunctive",
				sourceKind: "tutor-feedback",
			}),
		);
		expect(result).toMatchObject({ success: true, count: 1 });
		expect(mockCreateSelectionNotes).toHaveBeenCalledWith(expect.objectContaining({ source: { type: "translation", attemptId: 9 }, language: "fr" }));
	});

	it("answers a question about selected translation feedback", async () => {
		selectQueue.push([{ ...attemptRecord, status: "evaluated", evaluation: { overallScore: "A", overallFeedback: "Good", paragraphs: [] } }]);
		mockFollowUp.mockResolvedValue({ answer: "Use this form after expressions of doubt." });
		const result = await actions.askSelection(
			event({ attemptId: "9", selectedText: "subjunctive form", question: "Why?", currentContext: "Tutor feedback" }),
		);
		expect(result).toEqual({ success: true, answer: "Use this form after expressions of doubt." });
		expect(mockFollowUp).toHaveBeenCalledWith(expect.objectContaining({ learningLanguage: "fr", feedbackLanguage: "en" }));
	});

	it("rejects selection actions before evaluation", async () => {
		selectQueue.push([attemptRecord]);
		const result = (await actions.saveSelectionNotes(event({ attemptId: "9", selectedText: "text" }))) as any;
		expect(result).toMatchObject({ status: 409, data: { error: "Evaluation is not available" } });
		expect(mockCreateSelectionNotes).not.toHaveBeenCalled();
	});

	it("saves selection Q&A with the translation attempt as its source", async () => {
		selectQueue.push([{ ...attemptRecord, status: "evaluated", evaluation: { overallScore: "A", overallFeedback: "Good", paragraphs: [] } }]);
		mockCreateQaNote.mockResolvedValue({ note: { id: 4 } });
		const result = await actions.saveSelectionQaNote(
			event({ attemptId: "9", selectedText: "natural phrase", surroundingContext: "Context", question: "Why natural?", answer: "Because..." }),
		);
		expect(result).toMatchObject({ success: true, note: { id: 4 } });
		expect(mockCreateQaNote).toHaveBeenCalledWith(expect.objectContaining({ source: { type: "translation", attemptId: 9 }, language: "fr" }));
	});
});
