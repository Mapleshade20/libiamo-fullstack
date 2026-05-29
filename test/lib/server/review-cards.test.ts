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

const { mockDb, mockChatJson } = vi.hoisted(() => {
	const mockQuery = {
		note: { findFirst: vi.fn() },
		reviewCard: { findFirst: vi.fn(), findMany: vi.fn() },
	};
	return {
		mockDb: {
			insert: vi.fn(() => mockDb),
			values: vi.fn(() => mockDb),
			returning: vi.fn(() => []),
			select: vi.fn(() => mockDb),
			from: vi.fn(() => mockDb),
			where: vi.fn(() => mockDb),
			orderBy: vi.fn(() => mockDb),
			limit: vi.fn(() => []),
			update: vi.fn(() => mockDb),
			set: vi.fn(() => mockDb),
			query: mockQuery,
		},
		mockChatJson: vi.fn(),
	};
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/llm", () => ({ chatJson: mockChatJson }));

import { createCardFromNote, getDueCards, getReviewStats, noteHasCard, rateCard } from "$lib/server/review-cards";

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.returning.mockReturnValue([]);
});

function makeCardRow(overrides: Record<string, unknown> = {}) {
	return {
		id: overrides.id ?? 1,
		userId: USER_ID,
		sourceNoteId: overrides.sourceNoteId ?? null,
		language: overrides.language ?? "es",
		cardType: overrides.cardType ?? "vocabulary",
		front: overrides.front ?? "hola",
		back: overrides.back ?? "hello",
		context: overrides.context ?? null,
		fsrsCard: overrides.fsrsCard ?? serializeCard(createNewCard()),
		createdAt: new Date(),
		updatedAt: new Date(),
	} as const;
}

describe("noteHasCard", () => {
	it("returns true when a card exists", async () => {
		mockDb.query.reviewCard.findFirst.mockResolvedValueOnce({ id: 1 });
		const result = await noteHasCard(NOTE_ID);
		expect(result).toBe(true);
	});

	it("returns false when no card exists", async () => {
		mockDb.query.reviewCard.findFirst.mockResolvedValueOnce(undefined);
		const result = await noteHasCard(NOTE_ID);
		expect(result).toBe(false);
	});
});

describe("createCardFromNote", () => {
	it("throws when note is not found", async () => {
		mockDb.query.note.findFirst.mockResolvedValueOnce(undefined);
		await expect(createCardFromNote(NOTE_ID, USER_ID)).rejects.toThrow("Note not found");
	});

	it("returns { created: false } when card already exists", async () => {
		mockDb.query.note.findFirst.mockResolvedValue({ id: NOTE_ID, tutorComment: "test", keywords: null, sourceContext: null });
		mockDb.query.reviewCard.findFirst.mockResolvedValueOnce({ id: 1 });
		const result = await createCardFromNote(NOTE_ID, USER_ID);
		expect(result).toEqual({ created: false });
	});

	it("returns { created: false } when LLM skips", async () => {
		mockDb.query.note.findFirst.mockResolvedValue({ id: NOTE_ID, tutorComment: "test", keywords: null, sourceContext: null });
		// First call: card check (no existing)
		mockDb.query.reviewCard.findFirst.mockResolvedValueOnce(undefined);
		// Second call: session language lookup
		mockDb.query.note.findFirst.mockResolvedValue({
			sourceSession: { task: { language: "es" } },
		});
		mockChatJson.mockResolvedValueOnce({ shouldSkip: true });

		const result = await createCardFromNote(NOTE_ID, USER_ID);
		expect(result).toEqual({ created: false });
	});

	it("creates card when LLM returns valid content", async () => {
		mockDb.query.note.findFirst.mockResolvedValue({
			id: NOTE_ID,
			tutorComment: "Use subjunctive after 'no porque'",
			keywords: ["no porque + subj"],
			sourceContext: "No porque es fácil.",
		});
		mockDb.query.reviewCard.findFirst.mockResolvedValueOnce(undefined);
		mockDb.query.note.findFirst.mockResolvedValue({
			sourceSession: { task: { language: "es" } },
		});
		mockChatJson.mockResolvedValueOnce({
			cardType: "grammar",
			front: "No porque ___ fácil. (ser)",
			back: "No porque sea fácil. Use subjunctive after 'no porque' when denying a reason.",
			context: "No porque sea fácil.",
		});

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
		card.due = new Date(Date.now() - 3600000); // 1 hour ago
		const row = makeCardRow({ fsrsCard: serializeCard(card) });
		mockDb.limit.mockReturnValueOnce([row]);

		const result = await getDueCards(USER_ID, "es");
		expect(result).toHaveLength(1);
		expect(result[0].previewIntervals).toBeDefined();
		expect(result[0].previewIntervals.again).toBeDefined();
		expect(result[0].previewIntervals.good).toBeDefined();
	});

	it("formats month-level intervals for high-stability cards", async () => {
		// Build a card with high stability through simulated reviews
		const card = createNewCard();
		const scheduler = (await import("$lib/server/fsrs-scheduler")).getScheduler();
		// Simulate 10 Good reviews to build high stability
		let current = card;
		let simulatedNow = new Date();
		for (let i = 0; i < 10; i++) {
			simulatedNow = new Date(current.due.getTime() + 1000);
			const result = scheduler.next(current, simulatedNow, Rating.Good);
			current = result.card;
		}
		// Make the card due for the getDueCards filter
		current.due = new Date(Date.now() - 3600000);
		current.last_review = new Date(Date.now() - 7200000);
		const row = makeCardRow({ fsrsCard: serializeCard(current) });
		mockDb.limit.mockReturnValueOnce([row]);

		const result = await getDueCards(USER_ID, "es");
		expect(result).toHaveLength(1);
		expect(result[0].previewIntervals.easy).toMatch(/mo$/);
	});

	it("filters out future cards", async () => {
		const card = createNewCard();
		card.due = new Date(Date.now() + 86400000); // tomorrow
		const row = makeCardRow({ fsrsCard: serializeCard(card) });
		mockDb.limit.mockReturnValueOnce([row]);

		const result = await getDueCards(USER_ID, "es");
		expect(result).toEqual([]);
	});
});

describe("rateCard", () => {
	it("throws when card is not found", async () => {
		mockDb.query.reviewCard.findFirst.mockResolvedValueOnce(undefined);
		await expect(rateCard(1, USER_ID, 3, 30)).rejects.toThrow("Card not found");
	});

	it("applies rating and returns updated card", async () => {
		const card = createNewCard();
		const row = makeCardRow({ fsrsCard: serializeCard(card) });
		mockDb.query.reviewCard.findFirst.mockResolvedValueOnce(row);

		const result = await rateCard(1, USER_ID, 3, 30);
		expect(result.card).toBeDefined();
		expect(result.nextDue).toBeDefined();
		// Should have updated the card
		expect(mockDb.update).toHaveBeenCalled();
		// Should have created a review log
		expect(mockDb.insert).toHaveBeenCalled();
	});
});

describe("getReviewStats", () => {
	it("returns zeros when no cards exist", async () => {
		// First SELECT: allCards
		mockDb.select.mockImplementation(() => mockDb);
		mockDb.from.mockReturnValue(mockDb);
		mockDb.where.mockReturnValue([]);
		// Second SELECT: reviewedToday
		mockDb.select.mockReturnValue(mockDb);
		// Third SELECT: pendingNotes
		mockDb.leftJoin = vi.fn().mockReturnValue(mockDb);

		const stats = await getReviewStats(USER_ID, "es");

		expect(stats.totalCards).toBe(0);
		expect(stats.dueToday).toBe(0);
		expect(stats.newCount).toBe(0);
		expect(stats.learningCount).toBe(0);
		expect(stats.reviewCount).toBe(0);
	});

	it("counts cards in different states", async () => {
		const newCard = createNewCard();
		// Push new card's due into the future so it's not counted as due
		newCard.due = new Date(Date.now() + 86400000);
		const reviewCardObj = createNewCard();
		reviewCardObj.state = State.Review;
		reviewCardObj.due = new Date(Date.now() - 3600000);
		const relearningCard = createNewCard();
		relearningCard.state = State.Relearning;
		relearningCard.due = new Date(Date.now() + 86400000);

		// Return three cards via the final where() call in the chain
		const cards = [{ fsrsCard: serializeCard(newCard) }, { fsrsCard: serializeCard(reviewCardObj) }, { fsrsCard: serializeCard(relearningCard) }];

		// The review-cards code does: db.select().from().where()
		// Need mockDb.where() to return cards for the allCards query and [] for others
		let whereCallCount = 0;
		mockDb.where.mockImplementation(() => {
			whereCallCount++;
			return whereCallCount === 1 ? cards : [];
		});
		mockDb.select.mockImplementation(() => mockDb);
		mockDb.from.mockReturnValue(mockDb);
		mockDb.leftJoin = vi.fn().mockReturnValue(mockDb);

		const stats = await getReviewStats(USER_ID, "es");

		expect(stats.totalCards).toBe(3);
		expect(stats.newCount).toBe(1);
		expect(stats.learningCount).toBe(1);
		expect(stats.reviewCount).toBe(1);
		expect(stats.dueToday).toBe(1);
	});
});
