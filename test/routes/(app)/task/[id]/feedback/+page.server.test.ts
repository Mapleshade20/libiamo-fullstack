import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		query: { practiceSession: { findFirst: vi.fn() } },
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/feedback", () => ({
	getExistingFeedback: vi.fn(),
	buildFeedbackConversation: vi.fn(() => ({ chains: [], allMessages: [] })),
}));

import { getExistingFeedback } from "$lib/server/feedback";
import { load } from "$routes/(app)/task/[id]/feedback/+page.server";

const mockGetExistingFeedback = getExistingFeedback as ReturnType<typeof vi.fn>;

function mockSession(overrides: Record<string, unknown> = {}) {
	return {
		id: overrides.id ?? 42,
		status: overrides.status ?? "completed",
		agentPromptSnapshot: overrides.agentPromptSnapshot ?? {},
		messages: overrides.messages ?? [],
		task: overrides.task ?? {
			id: 100,
			title: "Test Task",
			language: "es",
			template: { ui: "discord" },
			variant: { openingState: {} },
		},
	};
}

const mockEvent = (user: unknown, taskId = "1") =>
	({
		locals: { user },
		params: { id: taskId },
	}) as any;

describe("task feedback page load", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetExistingFeedback.mockResolvedValue(null);
	});

	it("redirects when user is not authenticated", async () => {
		await expect(load(mockEvent(null))).rejects.toMatchObject({ status: 302, location: "/sign-in" });
	});

	it("returns 400 for invalid task ID", async () => {
		await expect(load(mockEvent({ id: "user-1" }, "abc"))).rejects.toMatchObject({ status: 400 });
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
