import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockInsertNotes, mockRateNote, mockStudyQueueKind, mockGeneratePractice, mockVerifySecondDraft, mockHydrate } = vi.hoisted(() => {
	const db = {
		query: { note: { findMany: vi.fn(), findFirst: vi.fn() } },
		update: vi.fn(),
		transaction: vi.fn(),
	};
	db.transaction.mockImplementation(async (callback) => callback(db));
	return {
		mockDb: db,
		mockInsertNotes: vi.fn(),
		mockRateNote: vi.fn(),
		mockStudyQueueKind: vi.fn(() => "new"),
		mockGeneratePractice: vi.fn(),
		mockVerifySecondDraft: vi.fn(),
		mockHydrate: vi.fn(),
	};
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/note", () => ({ insertNotes: mockInsertNotes }));
vi.mock("$lib/server/review", () => ({ rateNote: mockRateNote, studyQueueKind: mockStudyQueueKind }));
vi.mock("$lib/server/translation-evaluation/practice-generation", () => ({ generateTranslationPractice: mockGeneratePractice }));
vi.mock("$lib/server/translation-evaluation/verifier", () => ({ verifySecondDraft: mockVerifySecondDraft }));
vi.mock("$lib/server/translation-workflow", () => ({
	TranslationWorkflowError: class TranslationWorkflowError extends Error {
		constructor(
			public status: number,
			message: string,
		) {
			super(message);
		}
	},
	hydrateTranslationEvaluation: mockHydrate,
}));

import {
	completeTranslationTransfer,
	enterTranslationTransfer,
	generateTranslationPractice,
	rateTranslationTransferNote,
	verifyTranslationSecondDraft,
} from "$lib/server/translation-practice";

const EVALUATED_AT = new Date("2026-07-15T12:00:00.000Z");

function record(overrides: Record<string, unknown> = {}) {
	return {
		id: 9,
		userId: "u1",
		workflowPhase: "second_draft",
		evaluation: { cards: [{ referenceAnswer: "Correct" }] },
		feedbackLanguage: "en",
		generation1Messages: { messages: [{ role: "assistant", content: "generation one" }] },
		evaluatedAt: EVALUATED_AT,
		practiceGeneratedAt: null,
		targetLanguage: "fr",
		promptLanguage: "en",
		...overrides,
	} as any;
}

function mockUpdate(rows: unknown[]) {
	const returning = vi.fn().mockResolvedValue(rows);
	const where = vi.fn(() => ({ returning }));
	const set = vi.fn(() => ({ where }));
	mockDb.update.mockReturnValue({ set });
	return set;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.transaction.mockImplementation(async (callback) => callback(mockDb));
});

describe("Generation 2 practice", () => {
	it("claims the evaluation version and inserts generated Notes atomically", async () => {
		const cards = [{ ordinal: 0, referenceAnswer: "Correct" }];
		mockHydrate.mockResolvedValue({ evaluation: { cards } });
		const generatedNotes = [
			{
				vocab: "venir de",
				targetDefinition: "indique une action qui vient de se produire",
				nativeDefinition: "刚刚做过某事",
				examples: Array.from({ length: 4 }, (_, ordinal) => ({ nativeText: `front ${ordinal}`, targetText: `back ${ordinal}` })),
			},
		];
		mockGeneratePractice.mockResolvedValue({ value: { notes: generatedNotes } });
		mockUpdate([{ id: 9 }]);
		const persisted = [{ id: 21, vocab: generatedNotes[0].vocab, examples: generatedNotes[0].examples }];
		mockDb.query.note.findMany.mockResolvedValue(persisted);

		expect(await generateTranslationPractice(record(), EVALUATED_AT.toISOString())).toEqual([{ ...persisted[0], queueKind: "new" }]);
		expect(mockGeneratePractice).toHaveBeenCalledWith({
			cards,
			sourceLanguage: "en",
			targetLanguage: "fr",
			userId: "u1",
		});
		expect(mockDb.transaction).toHaveBeenCalledOnce();
		expect(mockInsertNotes).toHaveBeenCalledWith(
			mockDb,
			expect.objectContaining({ source: { type: "translation", attemptId: 9 }, notes: generatedNotes }),
		);
	});

	it("returns existing Notes without another model call after generation", async () => {
		const existing = [{ id: 21 }];
		mockDb.query.note.findMany.mockResolvedValue(existing);
		expect(await generateTranslationPractice(record({ practiceGeneratedAt: new Date() }), EVALUATED_AT.toISOString())).toEqual([
			{ ...existing[0], queueKind: "new" },
		]);
		expect(mockGeneratePractice).not.toHaveBeenCalled();
	});

	it("rejects stale evaluation versions before generation", async () => {
		await expect(generateTranslationPractice(record(), "2026-07-15T12:01:00.000Z")).rejects.toMatchObject({ status: 409 });
		expect(mockHydrate).not.toHaveBeenCalled();
	});
});

describe("second draft and transfer", () => {
	it("appends verification to the successful Generation 1 history", async () => {
		mockVerifySecondDraft.mockResolvedValue({ value: { passed: false, unresolvedCardOrdinals: [0], commentary: "Try again" } });
		const result = await verifyTranslationSecondDraft({
			record: record(),
			evaluatedAt: EVALUATED_AT.toISOString(),
			paragraphs: ["Second draft"],
			cardOutcomes: [{ ordinal: 0, outcome: "passed" }],
		});
		expect(result).toMatchObject({ passed: false, unresolvedCardOrdinals: [0] });
		expect(mockVerifySecondDraft).toHaveBeenCalledWith(
			expect.objectContaining({
				generation1History: [{ role: "assistant", content: "generation one" }],
				secondDraftParagraphs: ["Second draft"],
				cardCount: 1,
			}),
		);
	});

	it("enters transfer while clearing provider history", async () => {
		const set = mockUpdate([{ id: 9 }]);
		await enterTranslationTransfer(record(), EVALUATED_AT.toISOString());
		expect(set).toHaveBeenCalledWith(expect.objectContaining({ workflowPhase: "transfer", generation1Messages: null }));
	});

	it("rates only a Note owned by this translation attempt", async () => {
		mockDb.query.note.findFirst.mockResolvedValue({ id: 21 });
		mockRateNote.mockResolvedValue({ nextDue: "later" });
		expect(await rateTranslationTransferNote({ record: record({ workflowPhase: "transfer" }), noteId: 21, rating: 3, elapsedSeconds: 8 })).toEqual({
			nextDue: "later",
		});
		expect(mockRateNote).toHaveBeenCalledWith(21, "u1", 3, 8);

		mockDb.query.note.findFirst.mockResolvedValue(null);
		await expect(
			rateTranslationTransferNote({ record: record({ workflowPhase: "transfer" }), noteId: 22, rating: 1, elapsedSeconds: 4 }),
		).rejects.toMatchObject({ status: 404 });
	});

	it("completes transfer only after practice has been persisted", async () => {
		await expect(completeTranslationTransfer(record({ workflowPhase: "transfer" }))).rejects.toMatchObject({ status: 409 });
		const set = mockUpdate([{ id: 9 }]);
		await completeTranslationTransfer(record({ workflowPhase: "transfer", practiceGeneratedAt: new Date() }));
		expect(set).toHaveBeenCalledWith(expect.objectContaining({ workflowPhase: "completed", completedAt: expect.any(Date) }));
	});
});
