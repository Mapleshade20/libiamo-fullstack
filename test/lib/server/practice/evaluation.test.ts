import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockCreditQuest } = vi.hoisted(() => {
	const db = {
		select: vi.fn(),
		update: vi.fn(),
		transaction: vi.fn(),
		query: { practiceSession: { findFirst: vi.fn() } },
	};
	return { mockDb: db, mockCreditQuest: vi.fn() };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/streak", () => ({ creditQuestCompletion: mockCreditQuest }));

import { completePracticeTransfer, finishPracticeFeedback } from "$lib/server/practice/evaluation";

const TIME_ZONE = "America/New_York";

function mockNoteCount(total: number) {
	mockDb.select.mockReturnValue({ from: () => ({ where: vi.fn().mockResolvedValue([{ total }]) }) });
}

function mockClaim(rows: unknown[]) {
	const returning = vi.fn().mockResolvedValue(rows);
	const set = vi.fn(() => ({ where: vi.fn(() => ({ returning })) }));
	mockDb.update.mockReturnValue({ set });
	return set;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.transaction.mockImplementation(async (callback) => callback(mockDb));
});

describe("finishPracticeFeedback", () => {
	it("moves on to the card pass without crediting the quest when notes were collected", async () => {
		mockNoteCount(2);
		const set = mockClaim([{ id: 7 }]);
		await expect(finishPracticeFeedback("u1", 7, TIME_ZONE)).resolves.toBe("transfer");
		expect(set).toHaveBeenCalledWith({ evaluationPhase: "transfer" });
		expect(mockCreditQuest).not.toHaveBeenCalled();
	});

	it("completes the evaluation and credits the quest in the claiming transaction when there is nothing to drill", async () => {
		mockNoteCount(0);
		const set = mockClaim([{ id: 7 }]);
		await expect(finishPracticeFeedback("u1", 7, TIME_ZONE)).resolves.toBe("completed");
		expect(set).toHaveBeenCalledWith({ evaluationPhase: "completed", evaluationCompletedAt: expect.any(Date) });
		expect(mockCreditQuest).toHaveBeenCalledWith(mockDb, "u1", expect.any(Date), TIME_ZONE);
	});

	it("rejects a lost claim without crediting", async () => {
		mockNoteCount(0);
		mockClaim([]);
		await expect(finishPracticeFeedback("u1", 7, TIME_ZONE)).rejects.toMatchObject({ status: 409 });
		expect(mockCreditQuest).not.toHaveBeenCalled();
	});
});

describe("completePracticeTransfer", () => {
	it("credits the quest exactly when it wins the transfer → completed claim", async () => {
		const set = mockClaim([{ id: 7 }]);
		await completePracticeTransfer("u1", 7, TIME_ZONE);
		expect(set).toHaveBeenCalledWith({ evaluationPhase: "completed", evaluationCompletedAt: expect.any(Date) });
		expect(mockCreditQuest).toHaveBeenCalledTimes(1);
	});

	it("treats a repeat after completion as success without a second credit", async () => {
		mockClaim([]);
		mockDb.query.practiceSession.findFirst.mockResolvedValue({ evaluationPhase: "completed" });
		await expect(completePracticeTransfer("u1", 7, TIME_ZONE)).resolves.toBeUndefined();
		expect(mockCreditQuest).not.toHaveBeenCalled();
	});

	it("rejects completion before the pass has started", async () => {
		mockClaim([]);
		mockDb.query.practiceSession.findFirst.mockResolvedValue({ evaluationPhase: "feedback" });
		await expect(completePracticeTransfer("u1", 7, TIME_ZONE)).rejects.toMatchObject({ status: 409 });
		expect(mockCreditQuest).not.toHaveBeenCalled();
	});
});
