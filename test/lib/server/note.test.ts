import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "test-user-id";
const SESSION_ID = 42;

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		query: {
			note: { findFirst: vi.fn() },
			practiceSession: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => []) })) })),
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					orderBy: vi.fn(() => []),
				})),
			})),
		})),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => []) })) })) })),
		delete: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => []) })) })),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/llm", () => ({ chatJson: vi.fn() }));

import { chatJson } from "$lib/server/llm";
import {
	createNote,
	createNoteFromSelectionQA,
	createNotesBatch,
	createNotesFromSelectionBatch,
	deleteNote,
	getNote,
	listNotes,
	updateNote,
	validateAndCreateNoteFromSelection,
} from "$lib/server/note";

const mockChatJson = chatJson as ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createNote", () => {
	it("creates a note with tutorComment", async () => {
		const expectedNote = { id: 1, tutorComment: "Use past tense" };
		const returning = vi.fn().mockResolvedValue([expectedNote]);
		const valuesFn = vi.fn().mockReturnValue({ returning });
		mockDb.insert.mockReturnValue({ values: valuesFn });

		const result = await createNote({
			userId: USER_ID,
			sourceSessionId: SESSION_ID,
			tutorComment: "Use past tense",
		});

		expect(result).toEqual(expectedNote);
		const insertedValues = valuesFn.mock.calls[0]?.[0];
		expect(insertedValues).toMatchObject({ userId: USER_ID, sourceSessionId: SESSION_ID, tutorComment: "Use past tense" });
		expect(insertedValues).not.toHaveProperty("frontContent");
		expect(insertedValues).not.toHaveProperty("backContent");
	});

	it("stores sourceMessageId, keywords and sourceContext when provided", async () => {
		const returning = vi.fn().mockResolvedValue([{ id: 3 }]);
		const valuesFn = vi.fn().mockReturnValue({ returning });
		mockDb.insert.mockReturnValue({ values: valuesFn });

		await createNote({
			userId: USER_ID,
			sourceSessionId: SESSION_ID,
			sourceMessageId: 99,
			tutorComment: "Use past tense",
			keywords: ["past tense", "yesterday"],
			sourceContext: "I go to the store yesterday.",
		});

		const insertedValues = valuesFn.mock.calls[0]?.[0];
		expect(insertedValues.sourceMessageId).toBe(99);
		expect(insertedValues.keywords).toEqual(["past tense", "yesterday"]);
		expect(insertedValues.sourceContext).toBe("I go to the store yesterday.");
	});
});

describe("createNotesBatch", () => {
	it("returns empty array for empty input", async () => {
		const result = await createNotesBatch(USER_ID, SESSION_ID, "en", []);
		expect(result).toEqual([]);
	});

	it("creates notes with knowledge points in tutorComment", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue({ messages: [] });
		mockChatJson.mockResolvedValueOnce({
			items: [
				{ knowledgePoint: "Use infinitive after 'to'", keywords: ["to + infinitive"], sourceContext: "I want to go." },
				{ knowledgePoint: "Choose precise vocabulary", keywords: ["precise word"], sourceContext: "He said it was good." },
			],
		});

		const returning = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
		const valuesFn = vi.fn().mockReturnValue({ returning });
		mockDb.insert.mockReturnValue({ values: valuesFn });

		const result = await createNotesBatch(USER_ID, SESSION_ID, "en", [
			{ tutorComment: "Wrong tense used", category: "grammar" },
			{ tutorComment: "Vocabulary too basic", category: "vocabulary" },
		]);

		expect(result).toHaveLength(2);
		expect(mockChatJson).toHaveBeenCalledTimes(1);
		expect(valuesFn).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ tutorComment: "Use infinitive after 'to'", keywords: ["to + infinitive"], sourceContext: "I want to go." }),
				expect.objectContaining({ tutorComment: "Choose precise vocabulary", keywords: ["precise word"], sourceContext: "He said it was good." }),
			]),
		);
	});
});

describe("createNotesFromSelectionBatch", () => {
	it("creates up to three notes from a long selection", async () => {
		mockChatJson.mockResolvedValueOnce({
			items: [
				{ knowledgePoint: "Use the preterite for completed past actions.", keywords: ["pretérito"], sourceContext: "Ayer fui al mercado." },
				{ knowledgePoint: "Use 'aunque' to concede a contrasting point.", keywords: ["aunque"], sourceContext: "Aunque estaba cansado, fui." },
				{ knowledgePoint: "Use 'me parece que' for softened opinions.", keywords: ["me parece que"], sourceContext: "Me parece que es buena idea." },
				{ knowledgePoint: "Extra item should be capped.", keywords: ["extra"], sourceContext: "Extra." },
			],
		});

		const returning = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
		const valuesFn = vi.fn().mockReturnValue({ returning });
		mockDb.insert.mockReturnValue({ values: valuesFn });

		const result = await createNotesFromSelectionBatch({
			userId: USER_ID,
			sessionId: SESSION_ID,
			language: "es",
			selectedText: "Ayer fui al mercado, aunque estaba cansado. Me parece que fue útil.",
			previousContext: "[Agent] ¿Qué hiciste ayer?",
			currentContext: "[You] Ayer fui al mercado, aunque estaba cansado. Me parece que fue útil.",
			sourceKind: "message",
		});

		expect(result.count).toBe(3);
		expect(valuesFn).toHaveBeenCalledWith(
			expect.arrayContaining([expect.objectContaining({ tutorComment: "Use the preterite for completed past actions." })]),
		);
		expect(valuesFn.mock.calls[0]?.[0]).toHaveLength(3);
		const prompt = mockChatJson.mock.calls[0]?.[1]?.messages?.[1]?.content as string;
		expect(prompt).toContain("Previous visible message/context");
		expect(prompt).toContain("[Agent] ¿Qué hiciste ayer?");
		expect(prompt).toContain("Current message/comment/context");
	});

	it("returns zero notes with reason when selection is not useful", async () => {
		mockChatJson.mockResolvedValueOnce({ items: [], reason: "Selection is too generic." });

		const result = await createNotesFromSelectionBatch({
			userId: USER_ID,
			sessionId: SESSION_ID,
			language: "en",
			selectedText: "ok",
			currentContext: "ok",
		});

		expect(result.count).toBe(0);
		expect(result.reason).toBe("Selection is too generic.");
		expect(mockDb.insert).not.toHaveBeenCalled();
	});
});

describe("listNotes", () => {
	it("returns notes ordered by id desc", async () => {
		const notes = [{ id: 3 }, { id: 1 }];
		const orderByFn = vi.fn().mockResolvedValue(notes);
		const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
		const fromFn = vi.fn().mockReturnValue({ where: whereFn });
		mockDb.select.mockReturnValue({ from: fromFn });

		const result = await listNotes(USER_ID);
		expect(result).toEqual(notes);
	});
});

describe("getNote", () => {
	it("finds note by id and userId", async () => {
		const expected = { id: 5, tutorComment: "Use subjunctive" };
		mockDb.query.note.findFirst.mockResolvedValue(expected);

		const result = await getNote(5, USER_ID);
		expect(result).toEqual(expected);
	});

	it("returns null when not found", async () => {
		mockDb.query.note.findFirst.mockResolvedValue(null);
		const result = await getNote(999, USER_ID);
		expect(result).toBeNull();
	});
});

describe("updateNote", () => {
	it("updates tutorComment", async () => {
		const updated = { id: 1, tutorComment: "New note" };
		const returning = vi.fn().mockResolvedValue([updated]);
		const whereFn = vi.fn().mockReturnValue({ returning });
		const setFn = vi.fn().mockReturnValue({ where: whereFn });
		mockDb.update.mockReturnValue({ set: setFn });

		const result = await updateNote(1, USER_ID, { tutorComment: "New note" });
		expect(result).toEqual(updated);
		expect(setFn).toHaveBeenCalledWith({ tutorComment: "New note" });
	});

	it("updates keywords", async () => {
		const updated = { id: 1, keywords: ["past tense"] };
		const returning = vi.fn().mockResolvedValue([updated]);
		const whereFn = vi.fn().mockReturnValue({ returning });
		const setFn = vi.fn().mockReturnValue({ where: whereFn });
		mockDb.update.mockReturnValue({ set: setFn });

		const result = await updateNote(1, USER_ID, { keywords: ["past tense"] });
		expect(result).toEqual(updated);
		expect(setFn).toHaveBeenCalledWith({ keywords: ["past tense"] });
	});
});

describe("deleteNote", () => {
	it("deletes note by id and userId", async () => {
		const deleted = { id: 1 };
		const returning = vi.fn().mockResolvedValue([deleted]);
		const whereFn = vi.fn().mockReturnValue({ returning });
		mockDb.delete.mockReturnValue({ where: whereFn });

		const result = await deleteNote(1, USER_ID);
		expect(result).toEqual(deleted);
	});
});

describe("validateAndCreateNoteFromSelection", () => {
	it("creates note when LLM validates selection", async () => {
		mockChatJson.mockResolvedValueOnce({
			valid: true,
			knowledgePoint: "Use past tense after 'yesterday'",
			keywords: ["past tense", "yesterday"],
			sourceContext: "I go to the store yesterday.",
		});

		const expectedNote = { id: 1, tutorComment: "Use past tense after 'yesterday'" };
		const returning = vi.fn().mockResolvedValue([expectedNote]);
		const valuesFn = vi.fn().mockReturnValue({ returning });
		mockDb.insert.mockReturnValue({ values: valuesFn });

		const result = await validateAndCreateNoteFromSelection({
			userId: USER_ID,
			sessionId: SESSION_ID,
			selectedText: "I go to the store yesterday",
			surroundingContext: "What did you do yesterday? I go to the store yesterday.",
			language: "en",
		});

		expect(result.success).toBe(true);
		expect(result.note).toEqual(expectedNote);

		const insertedValues = valuesFn.mock.calls[0]?.[0];
		expect(insertedValues.tutorComment).toBe("Use past tense after 'yesterday'");
		expect(insertedValues.keywords).toEqual(["past tense", "yesterday"]);
		expect(insertedValues.sourceContext).toBe("I go to the store yesterday.");
	});

	it("rejects invalid selection with reason", async () => {
		mockChatJson.mockResolvedValueOnce({ valid: false, reason: "Selection is too short" });

		const result = await validateAndCreateNoteFromSelection({
			userId: USER_ID,
			sessionId: SESSION_ID,
			selectedText: "the",
			surroundingContext: "the cat sat on the mat",
			language: "en",
		});

		expect(result.success).toBe(false);
		expect(result.reason).toBe("Selection is too short");
		expect(mockDb.insert).not.toHaveBeenCalled();
	});
});

describe("createNoteFromSelectionQA", () => {
	it("creates note from Q&A distillation", async () => {
		mockChatJson.mockResolvedValueOnce({
			knowledgePoint: "'Could have' expresses past possibility, not 'could of'",
			keywords: ["could have", "could of"],
			sourceContext: "I could of done that.",
		});

		const expectedNote = { id: 1, tutorComment: "'Could have' expresses past possibility, not 'could of'" };
		const returning = vi.fn().mockResolvedValue([expectedNote]);
		const valuesFn = vi.fn().mockReturnValue({ returning });
		mockDb.insert.mockReturnValue({ values: valuesFn });

		const result = await createNoteFromSelectionQA({
			userId: USER_ID,
			sessionId: SESSION_ID,
			selectedText: "I could of done that",
			surroundingContext: "Why didn't you? I could of done that.",
			question: "Why is this wrong?",
			answer: "'Could of' is a common mistake. The correct form is 'could have'.",
			language: "en",
		});

		expect(result.success).toBe(true);
		expect(result.note).toEqual(expectedNote);

		const insertedValues = valuesFn.mock.calls[0]?.[0];
		expect(insertedValues.tutorComment).toBe("'Could have' expresses past possibility, not 'could of'");
		expect(insertedValues.keywords).toEqual(["could have", "could of"]);
		expect(insertedValues.sourceContext).toBe("I could of done that.");
	});
});
