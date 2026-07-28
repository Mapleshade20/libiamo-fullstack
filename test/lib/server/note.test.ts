import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "test-user-id";
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
import {
	createNoteFromSelectionQA,
	createNotes,
	createNotesBatch,
	createNotesFromSelectionBatch,
	deleteNote,
	getNote,
	listNotes,
	updateNote,
} from "$lib/server/note";

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
		});

		expect(result).toEqual([{ id: 7 }]);
		expect(mockDb.transaction).toHaveBeenCalledOnce();
		expect(noteValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: USER_ID,
				sourceSessionId: null,
				sourceTranslationAttemptId: 99,
				vocab: note.vocab,
				targetDefinition: note.targetDefinition,
				nativeDefinition: note.nativeDefinition,
				examples: note.examples,
				fsrsCard: expect.objectContaining({ state: expect.any(Number) }),
			}),
		);
	});

	it("rejects duplicate or incomplete example sets before writing", async () => {
		const duplicate = generatedNote();
		duplicate.examples[3] = duplicate.examples[0];
		await expect(
			createNotes({ userId: USER_ID, language: "en", source: { type: "practice", sessionId: SESSION_ID }, notes: [duplicate] }),
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
		});
		expect(result).toEqual([]);
		expect(mockChatJson).not.toHaveBeenCalled();
	});

	it("uses the learner's native language and persists validated generated notes", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue({
			messages: [{ role: "user", content: "I could of arrived earlier." }],
		});
		mockChatJson.mockResolvedValue({ value: { notes: [generatedNote()] } } as never);
		const { noteValues } = mockNoteInsert();

		await createNotesBatch({
			userId: USER_ID,
			source: { type: "practice", sessionId: SESSION_ID },
			language: "en",
			nativeLanguage: "fr",
			feedbackItems: [{ tutorComment: "Use could have, not could of.", category: "grammar" }],
		});

		const request = mockChatJson.mock.calls[0]?.[0];
		expect(request?.messages[0]?.content).toContain("native language is French");
		expect(request?.messages[0]?.content).toContain("nativeDefinition is its concise dictionary-style equivalent written entirely in French");
		expect(JSON.parse(request?.messages[1]?.content ?? "{}").items[0]).toMatchObject({
			ordinal: 0,
			conversationSnippet: "[user] I could of arrived earlier.",
		});
		expect(noteValues).toHaveBeenCalledOnce();
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
		});
		expect(result).toEqual({ success: true, note: { id: 8 } });
	});
});

describe("Note CRUD", () => {
	it("lists and loads owned Notes", async () => {
		const rows = [{ id: 3 }, { id: 1 }];
		const orderBy = vi.fn().mockResolvedValue(rows);
		mockDb.select.mockReturnValue({ from: () => ({ where: () => ({ orderBy }) }) });
		mockDb.query.note.findFirst.mockResolvedValue({ id: 3, examples: [] });
		expect(await listNotes(USER_ID)).toEqual(rows);
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
