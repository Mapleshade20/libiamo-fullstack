import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		query: { practiceSession: { findFirst: vi.fn() } },
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/review/transfer", () => ({ listTransferNotes: vi.fn(async () => []), rateTransferNote: vi.fn() }));
vi.mock("$lib/server/review/notes", () => ({ createNotesFromSelectionBatch: vi.fn() }));
vi.mock("$lib/server/practice/session", () => ({ getSessionOrFail: vi.fn(async () => ({ id: 42 })) }));
vi.mock("$lib/server/task/context", () => ({
	parseTaskId: (value: string) => (/^[1-9]\d*$/.test(value) ? Number(value) : null),
	getTaskIdentity: vi.fn(async (id: number) => ({ id, interactionType: "chat", language: "es" })),
	resolveRequestLineup: vi.fn(async () => ({ lineupId: 3, pinned: false })),
	findPracticeSession: vi.fn(async () => ({ id: 42 })),
}));
vi.mock("$lib/server/practice/feedback", () => ({
	getExistingFeedback: vi.fn(),
	buildFeedbackConversation: vi.fn(() => ({ chains: [], allMessages: [] })),
}));

import { getExistingFeedback } from "$lib/server/practice/feedback";
import { createNotesFromSelectionBatch } from "$lib/server/review/notes";
import { rateTransferNote } from "$lib/server/review/transfer";
import { actions, load } from "$routes/(app)/task/[id]/feedback/+page.server";

const mockGetExistingFeedback = getExistingFeedback as ReturnType<typeof vi.fn>;

function mockSession(overrides: Record<string, unknown> = {}) {
	return {
		id: overrides.id ?? 42,
		status: overrides.status ?? "completed",
		messages: overrides.messages ?? [],
		task: overrides.task ?? { title: "Test Task", language: "es", ui: "discord", openingState: {} },
	};
}

const mockEvent = (user: unknown, taskId = "1") =>
	({
		locals: { user },
		params: { id: taskId },
		url: new URL(`https://libiamo.test/task/${taskId}/feedback`),
		cookies: { get: vi.fn() },
		depends: vi.fn(),
	}) as any;

describe("task feedback page load", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetExistingFeedback.mockResolvedValue(null);
	});

	it("redirects when user is not authenticated", async () => {
		await expect(load(mockEvent(null))).rejects.toMatchObject({ status: 302, location: "/sign-in" });
	});

	it("returns 404 for invalid task ID", async () => {
		await expect(load(mockEvent({ id: "user-1" }, "abc"))).rejects.toMatchObject({ status: 404 });
	});

	it("redirects when session does not exist", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue(null);
		await expect(load(mockEvent({ id: "user-1" }))).rejects.toMatchObject({ status: 303 });
	});

	it("redirects when session is still in_progress", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession({ status: "in_progress" }));
		await expect(load(mockEvent({ id: "user-1" }))).rejects.toMatchObject({ status: 303 });
	});

	it("redirects abandoned sessions instead of opening a report", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession({ status: "abandoned" }));
		await expect(load(mockEvent({ id: "user-1" }))).rejects.toMatchObject({ status: 303 });
	});

	it("returns page data for completed session", async () => {
		mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession());
		const result: Record<string, unknown> = (await load(mockEvent({ id: "user-1" }))) as any;
		expect(result).toHaveProperty("sessionId", 42);
		expect(result).toHaveProperty("taskTitle", "Test Task");
		expect(result).toHaveProperty("conversation");
		expect(result).toHaveProperty("existingFeedback", null);
		expect(result).toHaveProperty("language", "es");
	});

	it("returns existing feedback for evaluated session", async () => {
		const feedback = { annotations: [], objectives: [], summary: "Good job" };
		mockGetExistingFeedback.mockResolvedValue(feedback);
		mockDb.query.practiceSession.findFirst.mockResolvedValue(mockSession({ status: "evaluated" }));
		const result: Record<string, unknown> = (await load(mockEvent({ id: "user-1" }))) as any;
		expect(result.existingFeedback).toBe(feedback);
	});
});

describe("task feedback stage guards", () => {
	const actionEvent = (fields: Record<string, string>) => {
		const form = new FormData();
		for (const [key, value] of Object.entries(fields)) form.set(key, value);
		return {
			locals: { user: { id: "user-1", nativeLanguage: "en" } },
			params: { id: "1" },
			request: { formData: async () => form },
			cookies: { get: vi.fn() },
		} as any;
	};
	const sessionIn = (evaluationPhase: string) =>
		mockDb.query.practiceSession.findFirst.mockResolvedValue({
			status: "evaluated",
			evaluationPhase,
			tutorFeedback: null,
			task: { language: "es", maxTurns: 4 },
		});

	beforeEach(() => vi.clearAllMocks());

	it("rates cards only while the card pass is active", async () => {
		sessionIn("feedback");
		const result = await actions.rateTransfer(actionEvent({ sessionId: "42", noteId: "5", rating: "3", elapsedSeconds: "4" }));
		expect(result).toMatchObject({ status: 409 });
		expect(rateTransferNote).not.toHaveBeenCalled();
	});

	it("keeps the card set fixed once the pass has started", async () => {
		sessionIn("transfer");
		const result = await actions.saveSelectionNotes(actionEvent({ sessionId: "42", selectedText: "hola" }));
		expect(result).toMatchObject({ status: 409 });
		expect(createNotesFromSelectionBatch).not.toHaveBeenCalled();
	});
});
