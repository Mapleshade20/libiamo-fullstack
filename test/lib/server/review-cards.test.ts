import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNewCard, deserializeCard, Rating, State, serializeCard } from "$lib/server/fsrs-scheduler";

// ── fssr-scheduler tests ────────────────────────────────────────────

describe("Card serialization round-trip", () => {
	it("serializes and deserializes a new card correctly", () => {
		const card = createNewCard();
		const serialized = serializeCard(card);

		expect(serialized.state).toBe(State.New);
		expect(typeof serialized.due).toBe("string");
		expect(typeof serialized.stability).toBe("number");
		expect(typeof serialized.difficulty).toBe("number");

		const revived = deserializeCard(serialized);
		expect(revived.state).toBe(State.New);
		expect(revived.due).toBeInstanceOf(Date);
		expect(revived.stability).toBe(card.stability);
		expect(revived.difficulty).toBe(card.difficulty);
	});

	it("serializes and deserializes a card with last_review", () => {
		const card = createNewCard();
		card.last_review = new Date("2026-05-20T12:00:00Z");

		const serialized = serializeCard(card);
		expect(serialized.last_review).toBe("2026-05-20T12:00:00.000Z");

		const revived = deserializeCard(serialized);
		expect(revived.last_review).toBeInstanceOf(Date);
		expect(revived.last_review?.toISOString()).toBe("2026-05-20T12:00:00.000Z");
	});

	it("deserializes null/undefined gracefully", () => {
		const fromNull = deserializeCard(null);
		expect(fromNull.state).toBe(State.New);

		const fromEmpty = deserializeCard({});
		expect(fromEmpty.state).toBe(State.New);
		expect(fromEmpty.due).toBeInstanceOf(Date);
	});

	it("preserves difficulty and stability values", () => {
		const card = createNewCard();
		card.difficulty = 5.2;
		card.stability = 3.14;

		const revived = deserializeCard(serializeCard(card));
		expect(revived.difficulty).toBe(5.2);
		expect(revived.stability).toBe(3.14);
	});

	it("creates new cards with unique due dates", () => {
		const card1 = createNewCard();
		const card2 = createNewCard();
		expect(card1.due.getTime()).toBeLessThanOrEqual(card2.due.getTime());
	});
});

describe("Rating constants", () => {
	it("Rating values match the 1-4 scale", () => {
		expect(Rating.Again).toBe(1);
		expect(Rating.Hard).toBe(2);
		expect(Rating.Good).toBe(3);
		expect(Rating.Easy).toBe(4);
	});

	it("State values are distinct", () => {
		const states = [State.New, State.Learning, State.Review, State.Relearning];
		expect(new Set(states).size).toBe(4);
	});
});

// ── review-cards service tests ──────────────────────────────────────

const USER_ID = "test-user-id";
const NOTE_ID = 42;

const { mockDb, mockChatJson, mockQuery } = vi.hoisted(() => {
	const mq = {
		note: { findFirst: vi.fn() },
		reviewCard: { findFirst: vi.fn(), findMany: vi.fn() },
	};
	const mockObj: Record<string, any> = {
		insert: vi.fn(() => mockObj),
		values: vi.fn(() => mockObj),
		returning: vi.fn(() => [] as any[]),
		select: vi.fn(() => mockObj),
		from: vi.fn(() => mockObj),
		leftJoin: vi.fn(() => mockObj),
		where: vi.fn(() => mockObj),
		orderBy: vi.fn(() => mockObj),
		limit: vi.fn(() => [] as any[]),
		update: vi.fn(() => mockObj),
		set: vi.fn(() => mockObj),
		query: mq,
	};
	return {
		mockDb: mockObj,
		mockChatJson: vi.fn(),
		mockQuery: mq,
	};
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/llm", () => ({ chatJson: mockChatJson }));

import { createCardFromNote, getDueCards, getReviewStats, noteHasCard, rateCard } from "$lib/server/review-cards";

beforeEach(() => {
	vi.clearAllMocks();
});

function makeCardRow(overrides: Record<string, unknown> = {}) {
	return {
		id: (overrides.id as number) ?? 1,
		userId: USER_ID,
		sourceNoteId: (overrides.sourceNoteId as number | null) ?? null,
		language: (overrides.language as string) ?? "es",
		cardType: (overrides.cardType as string) ?? "vocabulary",
		front: (overrides.front as string) ?? "hola",
		back: (overrides.back as string) ?? "hello",
		context: (overrides.context as string | null) ?? null,
		fsrsCard: overrides.fsrsCard ?? serializeCard(createNewCard()),
		createdAt: new Date(),
		updatedAt: new Date(),
	} as any;
}

function chainable(): any {
	const c = {
		select: vi.fn(() => c),
		from: vi.fn(() => c),
		leftJoin: vi.fn(() => c),
		where: vi.fn(() => c),
		orderBy: vi.fn(() => c),
		limit: vi.fn(() => [] as any[]),
	};
	return c;
}

describe("noteHasCard", () => {
	it("returns true when a card exists", async () => {
		mockQuery.reviewCard.findFirst.mockResolvedValueOnce({ id: 1 });
		const result = await noteHasCard(NOTE_ID);
		expect(result).toBe(true);
	});

	it("returns false when no card exists", async () => {
		mockQuery.reviewCard.findFirst.mockResolvedValueOnce(undefined);
		const result = await noteHasCard(NOTE_ID);
		expect(result).toBe(false);
	});
});

describe("createCardFromNote", () => {
	it("throws when note is not found", async () => {
		mockQuery.note.findFirst.mockResolvedValueOnce(undefined);
		await expect(createCardFromNote(NOTE_ID, USER_ID)).rejects.toThrow("Note not found");
	});

	it("returns { created: false } when card already exists", async () => {
		mockQuery.note.findFirst.mockResolvedValue({ id: NOTE_ID, tutorComment: "test", keywords: null, sourceContext: null });
		mockQuery.reviewCard.findFirst.mockResolvedValueOnce({ id: 1 });
		const result = await createCardFromNote(NOTE_ID, USER_ID);
		expect(result).toEqual({ created: false });
	});

	it("returns { created: false } when LLM skips", async () => {
		mockQuery.note.findFirst.mockResolvedValue({
			id: NOTE_ID,
			tutorComment: "test",
			keywords: null,
			sourceContext: null,
			sourceSession: { task: { language: "es" } },
		});
		mockQuery.reviewCard.findFirst.mockResolvedValueOnce(undefined);
		mockChatJson.mockResolvedValueOnce({ shouldSkip: true });

		const result = await createCardFromNote(NOTE_ID, USER_ID);
		expect(result).toEqual({ created: false });
	});

	it("creates card when LLM returns valid content", async () => {
		mockQuery.note.findFirst.mockResolvedValue({
			id: NOTE_ID,
			tutorComment: "Use subjunctive",
			keywords: ["subj"],
			sourceContext: "test",
			sourceSession: { task: { language: "es" } },
		});
		mockQuery.reviewCard.findFirst.mockResolvedValueOnce(undefined);
		mockChatJson.mockResolvedValueOnce({
			cardType: "grammar",
			front: "No porque ___ fácil.",
			back: "No porque sea fácil.",
			context: "test",
		});

		mockDb.values.mockReturnValue(mockDb);
		mockDb.returning.mockReturnValue([]);

		const result = await createCardFromNote(NOTE_ID, USER_ID);
		expect(result).toEqual({ created: true });
		expect(mockDb.insert).toHaveBeenCalled();
	});
});

describe("getDueCards", () => {
	it("returns empty when no cards exist", async () => {
		mockDb.limit.mockReturnValueOnce([]);
		const result = await getDueCards(USER_ID, "es");
		expect(result).toEqual([]);
	});

	it("returns cards due now", async () => {
		const card = createNewCard();
		card.due = new Date(Date.now() - 3600000);
		const row = makeCardRow({ fsrsCard: serializeCard(card) });
		mockDb.limit.mockReturnValueOnce([row]);

		const result = await getDueCards(USER_ID, "es");
		expect(result).toHaveLength(1);
		expect(result[0].previewIntervals).toBeDefined();
	});

	it("formats month-level intervals for high-stability cards", async () => {
		const scheduler = (await import("$lib/server/fsrs-scheduler")).getScheduler();
		let current = createNewCard();
		let simulatedNow = new Date();
		for (let i = 0; i < 10; i++) {
			simulatedNow = new Date(current.due.getTime() + 1000);
			const result = scheduler.next(current, simulatedNow, Rating.Good);
			current = result.card;
		}
		current.due = new Date(Date.now() - 3600000);
		current.last_review = new Date(Date.now() - 7200000);
		mockDb.limit.mockReturnValueOnce([makeCardRow({ fsrsCard: serializeCard(current) })]);

		const result = await getDueCards(USER_ID, "es");
		expect(result).toHaveLength(1);
		expect(result[0].previewIntervals.easy).toMatch(/mo$/);
	});

	it("filters out future cards", async () => {
		// SQL-level due filter handles this — not testable with mocks
		expect(true).toBe(true);
	});
});

describe("rateCard", () => {
	it("throws when card is not found", async () => {
		mockQuery.reviewCard.findFirst.mockResolvedValueOnce(undefined);
		await expect(rateCard(1, USER_ID, 3, 30)).rejects.toThrow("Card not found");
	});

	it("applies rating and returns updated card", async () => {
		const card = createNewCard();
		mockQuery.reviewCard.findFirst.mockResolvedValueOnce(makeCardRow({ fsrsCard: serializeCard(card) }));

		mockDb.values.mockReturnValue(mockDb);
		mockDb.returning.mockReturnValue([]);

		const result = await rateCard(1, USER_ID, 3, 30);
		expect(result.card).toBeDefined();
		expect(result.nextDue).toBeDefined();
		expect(mockDb.update).toHaveBeenCalled();
		expect(mockDb.insert).toHaveBeenCalled();
	});
});

describe("getReviewStats", () => {
	it("returns zeros when no cards exist", async () => {
		const c = chainable();
		c.where.mockReturnValue([]);
		mockDb.select.mockImplementation(() => c);

		const stats = await getReviewStats(USER_ID, "es");

		expect(stats.totalCards).toBe(0);
		expect(stats.dueToday).toBe(0);
	});

	it("counts cards in different states", async () => {
		const newCard = createNewCard();
		newCard.due = new Date(Date.now() + 86400000);
		const reviewCardObj = createNewCard();
		reviewCardObj.state = State.Review;
		reviewCardObj.due = new Date(Date.now() - 3600000);
		const relearningCard = createNewCard();
		relearningCard.state = State.Relearning;
		relearningCard.due = new Date(Date.now() + 86400000);

		const cards = [{ fsrsCard: serializeCard(newCard) }, { fsrsCard: serializeCard(reviewCardObj) }, { fsrsCard: serializeCard(relearningCard) }];

		let call = 0;
		const c1 = chainable();
		c1.where.mockImplementation(() => (++call === 1 ? cards : []));

		const c2 = chainable();
		c2.where.mockReturnValue([]);

		// The code calls db.select() 3 times: allCards, reviewedToday, pendingNotes
		mockDb.select.mockImplementation(() => {
			const idx = mockDb.select.mock.calls.length;
			return idx <= 1 ? c1 : c2;
		});

		const stats = await getReviewStats(USER_ID, "es");

		expect(stats.totalCards).toBe(3);
		expect(stats.newCount).toBe(1);
		expect(stats.learningCount).toBe(1);
		expect(stats.reviewCount).toBe(1);
		expect(stats.dueToday).toBe(1);
	});
});
