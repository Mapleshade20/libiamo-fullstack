import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "test-user-id";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		select: vi.fn(() => mockDb),
		from: vi.fn(() => mockDb),
		where: vi.fn(() => mockDb),
		orderBy: vi.fn(() => mockDb),
		limit: vi.fn(() => []),
		insert: vi.fn(() => mockDb),
		values: vi.fn(() => mockDb),
		returning: vi.fn(() => []),
		update: vi.fn(() => mockDb),
		set: vi.fn(() => mockDb),
		query: {
			note: { findFirst: vi.fn() },
			reviewCard: { findFirst: vi.fn() },
		},
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { createNewCard, deserializeCard, Rating, State, serializeCard } from "$lib/server/fsrs-scheduler";

beforeEach(() => {
	vi.clearAllMocks();
});

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
