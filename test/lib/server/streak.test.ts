import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
	const db = {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		transaction: vi.fn(),
	};
	return { mockDb: db };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { recordQuestCompletion, recordReviewObservation } from "$lib/server/streak";

const USER_ID = "user_1";
// 12:00 UTC is 08:00 in New York, so the local day is the 18th on both sides of the clock.
const NOW = new Date("2026-09-18T12:00:00.000Z");
const TIME_ZONE = "America/New_York";

type Row = Record<string, unknown> | undefined;

/**
 * The helpers issue two selects: the locked streak row, then the account-wide queue probe. The
 * queue probe is the one with a `limit` but no `for`.
 */
function mockReads({ streak, dueCards }: { streak: Row; dueCards: boolean }) {
	const order: string[] = [];
	mockDb.select.mockImplementation((projection?: unknown) => ({
		from: () => ({
			where: () => ({
				limit: () => {
					if (projection) {
						order.push("queue");
						return Promise.resolve(dueCards ? [{ one: 1 }] : []);
					}
					return {
						for: async () => {
							order.push("lock");
							return streak ? [streak] : [];
						},
					};
				},
			}),
		}),
	}));
	return order;
}

function mockWrites() {
	const insertValues = vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }));
	mockDb.insert.mockReturnValue({ values: insertValues });
	const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
	mockDb.update.mockReturnValue({ set: updateSet });
	return { insertValues, updateSet };
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(mockDb));
});

describe("recordQuestCompletion", () => {
	it("lights the day when the queue probe finds nothing to study", async () => {
		mockReads({ streak: undefined, dueCards: false });
		const { updateSet } = mockWrites();

		await recordQuestCompletion(mockDb as never, USER_ID, NOW, TIME_ZONE);

		expect(updateSet).toHaveBeenCalledWith(
			expect.objectContaining({ streakDays: 1, throughDate: "2026-09-18", taskCount: 1, reviewCleared: true, timeZone: TIME_ZONE }),
		);
	});

	it("counts the quest but leaves the day dark while cards are still due", async () => {
		mockReads({ streak: undefined, dueCards: true });
		const { updateSet } = mockWrites();

		await recordQuestCompletion(mockDb as never, USER_ID, NOW, TIME_ZONE);

		expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ streakDays: 0, throughDate: null, taskCount: 1, reviewCleared: false }));
	});

	it("creates the row before locking it, since FOR UPDATE cannot lock what does not exist", async () => {
		const order = mockReads({ streak: undefined, dueCards: false });
		mockWrites();

		await recordQuestCompletion(mockDb as never, USER_ID, NOW, TIME_ZONE);

		expect(mockDb.insert).toHaveBeenCalled();
		expect(order[0]).toBe("lock");
		// Its own nested transaction: a streak failure must not roll back the quest that caused it.
		expect(mockDb.transaction).toHaveBeenCalledOnce();
	});
});

describe("recordReviewObservation", () => {
	it("returns the new record when clearing the queue lights a day already holding a quest", async () => {
		mockReads({
			streak: {
				userId: USER_ID,
				streakDays: 0,
				throughDate: null,
				bank: 0,
				progressDate: "2026-09-18",
				taskCount: 1,
				reviewCleared: false,
				bankEarnedToday: 0,
			},
			dueCards: false,
		});
		mockWrites();

		await expect(recordReviewObservation(USER_ID, NOW, TIME_ZONE)).resolves.toMatchObject({ streakDays: 1, throughDate: "2026-09-18" });
	});

	it("writes nothing when the observation changes nothing", async () => {
		mockReads({ streak: undefined, dueCards: true });
		const { updateSet } = mockWrites();

		await expect(recordReviewObservation(USER_ID, NOW, TIME_ZONE)).resolves.toBeNull();
		expect(updateSet).not.toHaveBeenCalled();
	});
});
