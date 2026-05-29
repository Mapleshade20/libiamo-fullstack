import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "test-user-id";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		query: {
			practiceSession: { findMany: vi.fn() },
			reviewCard: { findMany: vi.fn(() => []) },
		},
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { listCompletedSessions } from "$lib/server/archive";

beforeEach(() => {
	vi.clearAllMocks();
});

function makeSession(overrides: Record<string, unknown> = {}) {
	return {
		id: overrides.id ?? 1,
		taskId: overrides.taskId ?? 100,
		completedAt: overrides.completedAt ?? new Date(),
		task: { title: overrides.taskTitle ?? "Test Task", template: { ui: overrides.ui ?? "discord" } },
		notes: overrides.notes ?? [],
	};
}

function makeNote(overrides: Record<string, unknown> = {}) {
	return {
		id: overrides.id ?? 1,
		tutorComment: overrides.tutorComment ?? "Use past tense",
		keywords: overrides.keywords ?? ["past tense"],
		sourceContext: overrides.sourceContext ?? "I go yesterday.",
	};
}

describe("listCompletedSessions", () => {
	it("returns empty array when no completed sessions exist", async () => {
		mockDb.query.practiceSession.findMany.mockResolvedValue([]);
		const result = await listCompletedSessions(USER_ID);
		expect(result).toEqual([]);
	});

	it("includes sessions with no notes", async () => {
		mockDb.query.practiceSession.findMany.mockResolvedValue([makeSession({ id: 1, notes: [] }), makeSession({ id: 2, notes: [makeNote()] })]);
		const result = await listCompletedSessions(USER_ID);
		expect(result).toHaveLength(1);
		expect(result[0].sessions).toHaveLength(2);
		expect(result[0].sessions.map((session) => session.id)).toEqual([1, 2]);
		expect(result[0].sessions[0].notes).toEqual([]);
	});

	it("groups sessions into Today", async () => {
		mockDb.query.practiceSession.findMany.mockResolvedValue([makeSession({ id: 1, notes: [makeNote()], completedAt: new Date() })]);
		const result = await listCompletedSessions(USER_ID);
		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("Today");
	});

	it("groups sessions into Yesterday", async () => {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		mockDb.query.practiceSession.findMany.mockResolvedValue([makeSession({ id: 1, notes: [makeNote()], completedAt: yesterday })]);
		const result = await listCompletedSessions(USER_ID);
		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("Yesterday");
	});

	it("groups sessions into This Week", async () => {
		// Use a fixed Wednesday as "now". Monday of that week is "This Week".
		const wednesday = new Date(2025, 5, 11, 12, 0, 0); // Wednesday June 11, 2025
		const monday = new Date(2025, 5, 9, 12, 0, 0); // Monday June 9 — this week
		mockDb.query.practiceSession.findMany.mockResolvedValue([makeSession({ id: 1, notes: [makeNote()], completedAt: monday })]);
		const result = await listCompletedSessions(USER_ID, wednesday);
		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("This Week");
	});

	it("groups sessions into Earlier", async () => {
		const wednesday = new Date(2025, 5, 11, 12, 0, 0);
		const twoWeeksAgo = new Date(wednesday.getTime() - 14 * 86400000);
		mockDb.query.practiceSession.findMany.mockResolvedValue([makeSession({ id: 1, notes: [makeNote()], completedAt: twoWeeksAgo })]);
		const result = await listCompletedSessions(USER_ID, wednesday);
		expect(result[0].label).toBe("Earlier");
	});

	it("returns sessions ordered by completedAt desc within each group", async () => {
		const now = new Date(2025, 5, 11, 12, 0, 0); // Wednesday June 11, 2025
		const session1 = makeSession({ id: 1, notes: [makeNote()], completedAt: new Date(2025, 5, 11, 10, 0, 0) });
		const session2 = makeSession({ id: 2, notes: [makeNote()], completedAt: new Date(2025, 5, 11, 11, 0, 0) });
		mockDb.query.practiceSession.findMany.mockResolvedValue([session2, session1]);
		const result = await listCompletedSessions(USER_ID, now);
		expect(result[0].sessions[0].id).toBe(2);
		expect(result[0].sessions[1].id).toBe(1);
	});

	it("preserves group order: Today, Yesterday, This Week, Earlier", async () => {
		// Use a fixed Wednesday as "now" with deterministic relative dates
		const wednesday = new Date(2025, 5, 11, 12, 0, 0); // Wednesday June 11, 2025
		const today = wednesday;
		const yesterday = new Date(2025, 5, 10, 12, 0, 0); // Tuesday June 10
		const thisWeek = new Date(2025, 5, 9, 12, 0, 0); // Monday June 9 — start of this ISO week
		const earlier = new Date(2025, 5, 1, 12, 0, 0); // June 1 — earlier

		mockDb.query.practiceSession.findMany.mockResolvedValue([
			makeSession({ id: 1, notes: [makeNote()], completedAt: today }),
			makeSession({ id: 2, notes: [makeNote()], completedAt: yesterday }),
			makeSession({ id: 3, notes: [makeNote()], completedAt: thisWeek }),
			makeSession({ id: 4, notes: [makeNote()], completedAt: earlier }),
		]);
		const result = await listCompletedSessions(USER_ID, wednesday);
		expect(result.map((g) => g.label)).toEqual(["Today", "Yesterday", "This Week", "Earlier"]);
	});
});
