import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createNewCard,
	deserializeCard,
	getDueNotes,
	getScheduler,
	isReviewCardAvailable,
	Rating,
	ReviewCardNotDueError,
	rateNote,
	State,
	serializeCard,
	studyQueueKind,
} from "$lib/server/review";

const USER_ID = "test-user-id";

const { mockDb } = vi.hoisted(() => {
	const db = {
		select: vi.fn(),
		update: vi.fn(),
		insert: vi.fn(),
		transaction: vi.fn(),
	};
	db.transaction.mockImplementation(async (callback) => callback(db));
	return { mockDb: db };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.transaction.mockImplementation(async (callback) => callback(mockDb));
});

describe("FSRS persistence", () => {
	it("round-trips cards and their date fields", () => {
		const card = createNewCard();
		card.difficulty = 5.2;
		card.stability = 3.14;
		card.last_review = new Date("2026-05-20T12:00:00Z");

		const serialized = serializeCard(card);
		const revived = deserializeCard(serialized);
		expect(serialized).toMatchObject({ state: State.New, last_review: "2026-05-20T12:00:00.000Z" });
		expect(revived.due).toBeInstanceOf(Date);
		expect(revived.last_review?.toISOString()).toBe("2026-05-20T12:00:00.000Z");
		expect(revived.difficulty).toBe(5.2);
		expect(revived.stability).toBe(3.14);
	});

	it("recovers safely from missing or malformed persisted data", () => {
		expect(deserializeCard(null).state).toBe(State.New);
		expect(deserializeCard({ due: "not-a-date", state: "bad" }).state).toBe(State.New);
		expect(deserializeCard({ due: "not-a-date" }).due).toBeInstanceOf(Date);
	});

	it("maps FSRS states to the three Anki-style queue kinds", () => {
		expect(studyQueueKind({ state: State.New })).toBe("new");
		expect(studyQueueKind({ state: State.Learning })).toBe("learning");
		expect(studyQueueKind({ state: State.Relearning })).toBe("learning");
		expect(studyQueueKind({ state: State.Review })).toBe("review");
	});

	it("uses Anki-style intraday learning and relearning steps", () => {
		const scheduler = getScheduler();
		const now = new Date("2025-06-11T12:00:00Z");
		const newCard = createNewCard();
		newCard.due = now;

		const failed = scheduler.next(newCard, now, Rating.Again).card;
		expect(failed.state).toBe(State.Learning);
		expect(failed.due.getTime() - now.getTime()).toBe(60_000);
		const failedAgain = scheduler.next(failed, failed.due, Rating.Again).card;
		expect(failedAgain.state).toBe(State.Learning);
		expect(failedAgain.due.getTime() - failed.due.getTime()).toBe(60_000);

		const firstGood = scheduler.next(newCard, now, Rating.Good).card;
		expect(firstGood.state).toBe(State.Learning);
		expect(firstGood.due.getTime() - now.getTime()).toBe(10 * 60_000);
		const hardOnSecondStep = scheduler.next(firstGood, firstGood.due, Rating.Hard).card;
		expect(hardOnSecondStep.state).toBe(State.Learning);
		expect(hardOnSecondStep.due.getTime() - firstGood.due.getTime()).toBe(10 * 60_000);
		expect(scheduler.next(firstGood, firstGood.due, Rating.Good).card.state).toBe(State.Review);

		const graduated = scheduler.next(newCard, now, Rating.Easy).card;
		expect(graduated.state).toBe(State.Review);
		const lapsed = scheduler.next(graduated, graduated.due, Rating.Again).card;
		expect(lapsed.state).toBe(State.Relearning);
		expect(lapsed.due.getTime() - graduated.due.getTime()).toBe(10 * 60_000);
		const relearningHard = scheduler.next(lapsed, lapsed.due, Rating.Hard).card;
		expect(relearningHard.due.getTime() - lapsed.due.getTime()).toBe(15 * 60_000);
		expect(scheduler.parameters.maximum_interval).toBe(36_500);
	});

	it("only makes future intraday learning cards available inside Anki's learn-ahead window", () => {
		const now = new Date("2025-06-11T12:00:00Z");
		const card = createNewCard();
		card.state = State.Learning;
		card.due = new Date("2025-06-11T12:20:00Z");
		expect(isReviewCardAvailable(card, now)).toBe(true);

		card.due = new Date("2025-06-11T12:20:00.001Z");
		expect(isReviewCardAvailable(card, now)).toBe(false);

		card.state = State.Review;
		card.due = new Date("2025-06-11T12:01:00Z");
		expect(isReviewCardAvailable(card, now)).toBe(false);
	});
});

describe("getDueNotes", () => {
	it("selects an ordinary random JSON example and returns bilingual card fields", async () => {
		const card = createNewCard();
		card.due = new Date("2025-06-10T12:00:00Z");
		const row = {
			id: 42,
			userId: USER_ID,
			language: "en",
			vocab: "make a decision",
			targetDefinition: "to choose what to do",
			nativeDefinition: "作出决定",
			examples: Array.from({ length: 4 }, (_, index) => ({ nativeText: `native ${index}`, targetText: `target ${index}` })),
			fsrsCard: serializeCard(card),
		};
		const noteLimit = vi.fn().mockResolvedValue([row]);
		mockDb.select.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: noteLimit }) }) }) });

		const result = await getDueNotes(USER_ID, "en", 5, () => 0.6, new Date("2025-06-11T12:00:00Z"));

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: 42,
			due: "2025-06-10T12:00:00.000Z",
			exampleIndex: 2,
			nativeText: "native 2",
			targetText: "target 2",
			queueKind: "new",
		});
		expect(result[0].previewIntervals).toEqual({
			again: "<1m",
			hard: "<6m",
			good: "<10m",
			easy: expect.stringMatching(/^(\d+)(m|h|d|mo)$/),
		});
	});

	it("fails loudly when a Note has invalid JSON examples", async () => {
		const row = {
			id: 42,
			fsrsCard: serializeCard(createNewCard()),
			examples: [],
		};
		mockDb.select.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [row] }) }) }) });
		await expect(getDueNotes(USER_ID, "en")).rejects.toThrow("at least one example");
	});
});

describe("rateNote", () => {
	it("updates only FSRS state and logs in one transaction", async () => {
		const row = {
			id: 42,
			userId: USER_ID,
			fsrsCard: serializeCard(createNewCard()),
			examples: Array.from({ length: 4 }, (_, index) => ({ nativeText: `native ${index}`, targetText: `target ${index}` })),
		};
		mockDb.select.mockReturnValue({
			from: () => ({ where: () => ({ limit: () => ({ for: async () => [row] }) }) }),
		});
		const updateWhere = vi.fn().mockResolvedValue(undefined);
		const updateSet = vi.fn((_value: unknown) => ({ where: updateWhere }));
		mockDb.update.mockReturnValue({ set: updateSet });
		const logValues = vi.fn().mockResolvedValue(undefined);
		mockDb.insert.mockReturnValue({ values: logValues });

		const result = await rateNote(42, USER_ID, Rating.Good, 19, () => 0.6);

		expect(mockDb.transaction).toHaveBeenCalledOnce();
		expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ fsrsCard: expect.objectContaining({ reps: 1 }), updatedAt: expect.any(Date) }));
		expect(updateSet.mock.calls[0]?.[0]).not.toHaveProperty("exerciseOrder");
		expect(logValues).toHaveBeenCalledWith(expect.objectContaining({ noteId: 42, userId: USER_ID, rating: Rating.Good, elapsedSeconds: 19 }));
		expect(result).toMatchObject({
			nextDue: expect.any(String),
			queueKind: "learning",
			nativeText: "native 2",
			targetText: "target 2",
			previewIntervals: { again: "<1m" },
		});
	});

	it("rejects cards outside the due and learn-ahead window without writing", async () => {
		const card = createNewCard();
		card.state = State.Review;
		card.due = new Date("2025-06-13T12:00:00Z");
		const row = {
			id: 42,
			userId: USER_ID,
			fsrsCard: serializeCard(card),
			examples: [{ nativeText: "native", targetText: "target" }],
		};
		mockDb.select.mockReturnValue({
			from: () => ({ where: () => ({ limit: () => ({ for: async () => [row] }) }) }),
		});

		await expect(rateNote(42, USER_ID, Rating.Good, 1, Math.random, new Date("2025-06-11T12:00:00Z"))).rejects.toBeInstanceOf(ReviewCardNotDueError);
		expect(mockDb.update).not.toHaveBeenCalled();
		expect(mockDb.insert).not.toHaveBeenCalled();
	});

	it("rejects invalid ratings before opening a transaction", async () => {
		await expect(rateNote(42, USER_ID, 5 as never, 1)).rejects.toThrow("Invalid review rating");
		await expect(rateNote(42, USER_ID, Rating.Good, -1)).rejects.toThrow("Invalid review duration");
		expect(mockDb.transaction).not.toHaveBeenCalled();
	});
});
