import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGenerateEvaluation, mockVerifyCorrection } = vi.hoisted(() => {
	const db = {
		select: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn(),
	};
	db.transaction.mockImplementation(async (callback) => callback(db));
	return { mockDb: db, mockGenerateEvaluation: vi.fn(), mockVerifyCorrection: vi.fn() };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/translation-evaluation/generation", () => ({ generateTranslationEvaluation: mockGenerateEvaluation }));
vi.mock("$lib/server/translation-evaluation/verifier", async (importOriginal) => ({
	...(await importOriginal()),
	verifyCorrection: mockVerifyCorrection,
}));

import {
	assertGeneration1CallFitsBudget,
	finishTranslationCorrections,
	retryTranslationEvaluation,
	submitTranslationAttempt,
	TranslationWorkflowError,
	verifyTranslationCorrection,
} from "$lib/server/translation-workflow";

function record(overrides: Record<string, unknown> = {}) {
	return {
		id: 9,
		userId: "u1",
		sourceSetId: 4,
		workflowPhase: "draft",
		evaluation: null,
		generation1Messages: null,
		feedbackLanguage: null,
		submittedAt: null,
		evaluatedAt: null,
		practiceGeneratedAt: null,
		completedAt: null,
		updatedAt: new Date("2026-07-15T10:00:00.000Z"),
		candidates: [
			["First source", "Source one", "Opening"],
			["Second source", "Source two", "Closing"],
		],
		referenceParagraphs: ["Première référence", "Deuxième référence"],
		context: "a short letter",
		targetLanguage: "fr",
		promptLanguage: "en",
		...overrides,
	} as any;
}

function mockUpdateRows(rows: unknown[][]) {
	const sets: Array<ReturnType<typeof vi.fn>> = [];
	mockDb.update.mockImplementation(() => {
		const returning = vi.fn().mockResolvedValue(rows.shift() ?? []);
		const where = vi.fn(() => ({ returning }));
		const set = vi.fn(() => ({ where }));
		sets.push(set);
		return { set };
	});
	return sets;
}

function answerSelect(answers: unknown[]) {
	const orderBy = vi.fn().mockResolvedValue(answers);
	mockDb.select.mockReturnValue({ from: () => ({ where: () => ({ orderBy }) }) });
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.transaction.mockImplementation(async (callback) => callback(mockDb));
});

describe("submitTranslationAttempt", () => {
	it("validates, normalizes, and locks a draft without calling the evaluator", async () => {
		const sets = mockUpdateRows([[{ id: 9 }], [{ paragraphIndex: 0 }], [{ paragraphIndex: 1 }]]);

		const result = await submitTranslationAttempt({
			record: record(),
			answers: [
				{ paragraphIndex: 1, translation: "  Au revoir. ", candidateIndex: 2 },
				{ paragraphIndex: 0, translation: " Bonjour. ", candidateIndex: 0 },
			],
			feedbackLanguagePreference: "native",
			nativeLanguage: "ja",
		});

		expect(result.feedbackLanguage).toBe("ja");
		expect(mockDb.transaction).toHaveBeenCalledOnce();
		expect(mockGenerateEvaluation).not.toHaveBeenCalled();
		expect(sets[0]).toHaveBeenCalledWith(
			expect.objectContaining({ workflowPhase: "submitted", feedbackLanguage: "ja", submittedAt: expect.any(Date) }),
		);
		expect(sets[1]).toHaveBeenCalledWith(expect.objectContaining({ translation: "Bonjour.", candidateIndex: 0 }));
		expect(sets[2]).toHaveBeenCalledWith(expect.objectContaining({ translation: "Au revoir.", candidateIndex: 2 }));
	});

	it("rejects incomplete or invalid paragraph coverage before writing", async () => {
		await expect(
			submitTranslationAttempt({
				record: record(),
				answers: [{ paragraphIndex: 0, translation: "Bonjour", candidateIndex: 0 }],
				feedbackLanguagePreference: "target",
			}),
		).rejects.toMatchObject({ status: 400 });
		expect(mockDb.transaction).not.toHaveBeenCalled();
	});

	it("surfaces a lost cross-tab claim as a conflict", async () => {
		mockUpdateRows([[]]);
		await expect(
			submitTranslationAttempt({
				record: record({ candidates: [["First", "Second", "Third"]], referenceParagraphs: ["Référence"] }),
				answers: [{ paragraphIndex: 0, translation: "Bonjour", candidateIndex: 0 }],
				feedbackLanguagePreference: "target",
			}),
		).rejects.toMatchObject({ status: 409 });
	});
});

describe("Generation 1 lifecycle", () => {
	it("preflights the 40k total token budget", () => {
		expect(() =>
			assertGeneration1CallFitsBudget({
				sourceParagraphs: ["x".repeat(30_000)],
				learnerParagraphs: ["y".repeat(30_000)],
				referenceParagraphs: ["z".repeat(30_000)],
				sourceLanguage: "en",
				targetLanguage: "fr",
				feedbackLanguage: "en",
				context: "long text",
			}),
		).toThrowError(TranslationWorkflowError);
	});

	it("retries a locked submission and atomically versions evaluation plus successful history", async () => {
		const answers = [
			{ paragraphIndex: 0, translation: "Bonjour.", candidateIndex: 0 },
			{ paragraphIndex: 1, translation: "Au revoir.", candidateIndex: 2 },
		];
		answerSelect(answers);
		const evaluation = { overallCommentary: "Good", ratings: { accuracy: "A", naturalness: "B", grammar: "A", overall: "A" }, cards: [] };
		const history = [
			{ role: "user", content: "request" },
			{ role: "assistant", content: "response" },
		];
		mockGenerateEvaluation.mockResolvedValue({ value: evaluation, history });
		const evaluatedAt = new Date("2026-07-15T12:00:00.000Z");
		const sets = mockUpdateRows([[{ evaluatedAt }]]);

		const result = await retryTranslationEvaluation(record({ workflowPhase: "submitted", feedbackLanguage: "en" }));

		expect(result).toEqual({ evaluation, evaluatedAt });
		expect(mockGenerateEvaluation).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceParagraphs: ["First source", "Closing"],
				learnerParagraphs: ["Bonjour.", "Au revoir."],
				feedbackLanguage: "en",
				userId: "u1",
			}),
		);
		expect(sets[0]).toHaveBeenCalledWith(
			expect.objectContaining({ workflowPhase: "correction", evaluation, generation1Messages: { messages: history } }),
		);
	});
});

describe("correction transitions", () => {
	it("rejects stale evaluation versions before invoking the correction verifier", async () => {
		const attempt = record({
			workflowPhase: "correction",
			feedbackLanguage: "en",
			evaluatedAt: new Date("2026-07-15T12:00:00.000Z"),
			evaluation: { overallCommentary: "", ratings: {}, cards: [{}] },
		});
		await expect(
			verifyTranslationCorrection({
				record: attempt,
				evaluatedAt: "2026-07-15T12:01:00.000Z",
				cardOrdinal: 0,
				hintLevel: "initial",
				learnerRevision: "Revision",
			}),
		).rejects.toMatchObject({ status: 409 });
		expect(mockVerifyCorrection).not.toHaveBeenCalled();
	});

	it("completes a card-free evaluation and clears model history", async () => {
		const attempt = record({
			workflowPhase: "correction",
			evaluatedAt: new Date("2026-07-15T12:00:00.000Z"),
			evaluation: { overallCommentary: "Perfect", ratings: {}, cards: [] },
			generation1Messages: { messages: [{ role: "assistant", content: "history" }] },
		});
		const sets = mockUpdateRows([[{ workflowPhase: "completed" }]]);
		expect(await finishTranslationCorrections(attempt, "2026-07-15T12:00:00.000Z")).toBe("completed");
		expect(sets[0]).toHaveBeenCalledWith(
			expect.objectContaining({ workflowPhase: "completed", generation1Messages: null, completedAt: expect.any(Date) }),
		);
	});
});
