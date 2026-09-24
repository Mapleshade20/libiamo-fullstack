import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "test-user-id";
const AVAILABLE_FROM = new Date("2026-09-19T04:00:00.000Z");
const SESSION_ID = 42;

const { mockDb } = vi.hoisted(() => {
	const db = {
		query: {
			note: { findFirst: vi.fn() },
			practiceSession: { findFirst: vi.fn() },
			translationAttempt: { findFirst: vi.fn() },
		},
		insert: vi.fn(),
		select: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn(),
	};
	db.transaction.mockImplementation(async (callback) => callback(db));
	return { mockDb: db };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/llm", () => ({ chatJson: vi.fn() }));

import { chatJson } from "$lib/server/llm";
import { vocabularyNoteRules } from "$lib/server/review/note-rules";
import {
	createNoteFromSelectionQA,
	createNotes,
	createNotesBatch,
	createNotesFromSelectionBatch,
	deleteNote,
	getNote,
	updateNote,
} from "$lib/server/review/notes";

const mockChatJson = vi.mocked(chatJson);

function generatedNote(vocab = "make a decision") {
	return {
		sourceItemOrdinals: [0],
		vocab,
		targetDefinition: "to choose what to do after considering the possibilities",
		nativeDefinition: "作出决定",
		examples: [
			{ nativeText: "我们今天必须作出决定。", targetText: "We need to make a decision today." },
			{ nativeText: "她终于作出了决定。", targetText: "She finally made a decision." },
			{ nativeText: "这是个艰难的决定。", targetText: "It was a hard decision to make." },
			{ nativeText: "别仓促作决定。", targetText: "Don't rush into making a decision." },
		],
	};
}

function mockNoteInsert(created = { id: 1 }) {
	const noteValues = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([created]) }));
	mockDb.insert.mockImplementationOnce(() => ({ values: noteValues }));
	return { noteValues };
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.transaction.mockImplementation(async (callback) => callback(mockDb));
});

describe("createNotes", () => {
	it("creates each Note with bilingual definitions and JSON examples in one transaction", async () => {
		const { noteValues } = mockNoteInsert({ id: 7 });
		const note = generatedNote();

		const result = await createNotes({
			userId: USER_ID,
			language: "en",
			source: { type: "translation", attemptId: 99 },
			notes: [note],
			availableFrom: AVAILABLE_FROM,
		});

		expect(result).toEqual([{ id: 7 }]);
		expect(mockDb.transaction).toHaveBeenCalledOnce();
		expect(noteValues).toHaveBeenCalledWith([
			expect.objectContaining({
				userId: USER_ID,
				sourceSessionId: null,
				sourceTranslationAttemptId: 99,
				vocab: note.vocab,
				targetDefinition: note.targetDefinition,
				nativeDefinition: note.nativeDefinition,
				examples: note.examples,
				// A note joins the review queue from the learner's next local day, not the day its
				// task produced it.
				fsrsCard: expect.objectContaining({ state: expect.any(Number), due: AVAILABLE_FROM.toISOString() }),
			}),
		]);
	});

	it("rejects duplicate or incomplete example sets before writing", async () => {
		const duplicate = generatedNote();
		duplicate.examples[3] = duplicate.examples[0];
		await expect(
			createNotes({
				userId: USER_ID,
				language: "en",
				source: { type: "practice", sessionId: SESSION_ID },
				notes: [duplicate],
				availableFrom: AVAILABLE_FROM,
			}),
		).rejects.toThrow("4 distinct non-empty examples");
		expect(mockDb.insert).not.toHaveBeenCalled();
	});
});

describe("generated Note entry points", () => {
	it("does not call the model for an empty feedback batch", async () => {
		const result = await createNotesBatch({
			userId: USER_ID,
			source: { type: "practice", sessionId: SESSION_ID },
			language: "en",
			nativeLanguage: "fr",
			feedbackItems: [],
			availableFrom: AVAILABLE_FROM,
		});
		expect(result).toEqual([]);
		expect(mockChatJson).not.toHaveBeenCalled();
	});

	it("describes the source task once in the system message and sends only the items as input", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue({
			id: SESSION_ID,
			task: { title: "Late for class", language: "en", ui: "imessage", shortObjective: "Apologise to a friend", description: null },
		});
		mockChatJson.mockResolvedValue({ value: { notes: [generatedNote()] } } as never);
		const { noteValues } = mockNoteInsert();
		const item = { tutorComment: "Use could have, not could of.", category: "grammar" as const, sourceContext: "I could of arrived earlier." };

		await createNotesBatch({
			userId: USER_ID,
			source: { type: "practice", sessionId: SESSION_ID },
			language: "en",
			nativeLanguage: "fr",
			feedbackItems: [item],
			sessionOwnerId: USER_ID,
			availableFrom: AVAILABLE_FROM,
		});

		const [system, user] = mockChatJson.mock.calls[0]?.[0]?.messages ?? [];
		expect(system.content).toContain("Late for class");
		expect(system.content).toContain("French");
		expect(system.content).not.toContain("could of arrived");
		for (const rule of vocabularyNoteRules("English", "French")) expect(system.content).toContain(rule);
		expect(JSON.parse(user.content)).toEqual({ items: [{ ordinal: 0, ...item }] });
		expect(noteValues).toHaveBeenCalledOnce();
	});

	it("refuses a practice source the learner does not own", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue(null);
		await expect(
			createNotesBatch({
				userId: USER_ID,
				source: { type: "practice", sessionId: SESSION_ID },
				language: "en",
				nativeLanguage: "fr",
				feedbackItems: [{ tutorComment: "x" }],
				sessionOwnerId: USER_ID,
				availableFrom: AVAILABLE_FROM,
			}),
		).rejects.toThrow("Session not found");
		expect(mockChatJson).not.toHaveBeenCalled();
	});

	it("caps selection-derived notes at two before any database write", async () => {
		mockChatJson.mockResolvedValue({
			value: { notes: [generatedNote("one"), generatedNote("two"), generatedNote("three")] },
		} as never);
		await expect(
			createNotesFromSelectionBatch({
				userId: USER_ID,
				source: { type: "practice", sessionId: SESSION_ID },
				language: "en",
				nativeLanguage: "en",
				selectedText: "A useful selection",
				currentContext: "Context",
				availableFrom: AVAILABLE_FROM,
			}),
		).rejects.toThrow("more than 2 notes");
		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it("creates at most one Note from selection Q&A", async () => {
		mockChatJson.mockResolvedValue({ value: { notes: [generatedNote()] } } as never);
		mockNoteInsert({ id: 8 });
		const result = await createNoteFromSelectionQA({
			userId: USER_ID,
			source: { type: "practice", sessionId: SESSION_ID },
			selectedText: "could of",
			surroundingContext: "I could of done that.",
			question: "Why is this wrong?",
			answer: "Use could have.",
			language: "en",
			nativeLanguage: "en",
			availableFrom: AVAILABLE_FROM,
		});
		expect(result).toEqual({ success: true, note: { id: 8 } });
	});
});

describe("Note CRUD", () => {
	it("loads an owned Note", async () => {
		mockDb.query.note.findFirst.mockResolvedValue({ id: 3, examples: [] });
		expect(await getNote(3, USER_ID)).toEqual({ id: 3, examples: [] });
	});

	it("updates vocabulary and definitions without touching FSRS", async () => {
		const returning = vi.fn().mockResolvedValue([{ id: 1, vocab: "new" }]);
		const where = vi.fn(() => ({ returning }));
		const set = vi.fn(() => ({ where }));
		mockDb.update.mockReturnValue({ set });
		expect(await updateNote(1, USER_ID, { vocab: "new" })).toMatchObject({ vocab: "new" });
		expect(set).toHaveBeenCalledWith({ vocab: "new", updatedAt: expect.any(Date) });
	});

	it("deletes an owned Note", async () => {
		const returning = vi.fn().mockResolvedValue([{ id: 1 }]);
		mockDb.delete.mockReturnValue({ where: () => ({ returning }) });
		expect(await deleteNote(1, USER_ID)).toEqual({ id: 1 });
	});
});
