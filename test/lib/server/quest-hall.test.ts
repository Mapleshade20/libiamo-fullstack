import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadQuestHallData } from "$lib/server/quest-hall";

const { mockSelect, mockWhere, mockOrderBy, mockFindMany, mockFindUser } = vi.hoisted(() => {
	const mockOrderBy = vi.fn();
	const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
	const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
	const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin, where: mockWhere }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	const mockFindMany = vi.fn();
	const mockFindUser = vi.fn();
	return { mockSelect, mockWhere, mockOrderBy, mockFindMany, mockFindUser };
});

const { mockEnsureCurrentLineups, mockListLineupTasks } = vi.hoisted(() => ({
	mockEnsureCurrentLineups: vi.fn(),
	mockListLineupTasks: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ op: "and", conditions }),
	desc: (column: unknown) => ({ op: "desc", column }),
	eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
	inArray: (column: unknown, values: unknown[]) => ({ op: "inArray", column, values }),
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: "sql", strings: [...strings], values }),
}));

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
		query: {
			user: { findFirst: mockFindUser },
			practiceSession: { findMany: mockFindMany },
		},
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	task: {
		id: "task.id",
		title: "task.title",
		description: "task.description",
		difficulty: "task.difficulty",
		language: "task.language",
		interactionType: "task.interactionType",
		isActive: "task.isActive",
		createdAt: "task.createdAt",
	},
	practiceSession: {
		userId: "practiceSession.userId",
		lineupId: "practiceSession.lineupId",
	},
	translationAttempt: {
		id: "translationAttempt.id",
		userId: "translationAttempt.userId",
		taskId: "translationAttempt.taskId",
		sourceSetId: "translationAttempt.sourceSetId",
		workflowPhase: "translationAttempt.workflowPhase",
		updatedAt: "translationAttempt.updatedAt",
	},
	translationSourceSet: {
		id: "translationSourceSet.id",
		promptLanguage: "translationSourceSet.promptLanguage",
	},
}));

vi.mock("$lib/server/greetings", () => ({
	getGreeting: (language: string, name: string) => `${language}:${name}`,
	getRandomSubtitle: (language: string) => `${language}:subtitle`,
}));

vi.mock("$lib/server/lineups", async (importOriginal) => ({
	currentLineupStarts: (await importOriginal<typeof import("$lib/server/lineups")>()).currentLineupStarts,
	ensureCurrentLineups: mockEnsureCurrentLineups,
	listLineupTasks: mockListLineupTasks,
}));

const weeklyTask = { id: 20, title: "Weekly", shortObjective: "Weekly objective", ui: "apple_mail" as const, difficulty: 2, origin: "auto" };
const dailyTask = { id: 10, title: "Daily", shortObjective: "Daily objective", ui: "imessage" as const, difficulty: 1, origin: "manual" };

function containsCondition(value: unknown, expected: Record<string, unknown>): boolean {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	if (Object.entries(expected).every(([key, expectedValue]) => record[key] === expectedValue)) return true;
	return Object.values(record).some((child) =>
		Array.isArray(child) ? child.some((item) => containsCondition(item, expected)) : containsCondition(child, expected),
	);
}

describe("loadQuestHallData", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-19T16:30:00.000Z"));
		mockFindUser.mockResolvedValue(undefined);
		mockEnsureCurrentLineups.mockResolvedValue({ daily: 1, weekly: 2 });
		mockListLineupTasks.mockImplementation(async (lineupId: number) => (lineupId === 1 ? [dailyTask] : [weeklyTask]));
		mockFindMany.mockResolvedValue([]);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("reads the lineups current on the browser-local day with each entry's own progress", async () => {
		mockFindUser.mockResolvedValue({ levelSelfAssign: { en: 2, es: 1, fr: 3, ja: 2 } });
		mockOrderBy.mockResolvedValueOnce([]);
		mockFindMany.mockImplementation(async (query: { where: unknown }) =>
			containsCondition(query.where, { op: "eq", column: "practiceSession.lineupId", value: 1 })
				? [
						{
							taskId: 10,
							status: "evaluated",
							evaluationPhase: "completed",
							lastSeenAssistantMessageId: 4,
							messages: [
								{ id: 3, role: "assistant" },
								{ id: 5, role: "assistant" },
								{ id: 6, role: "assistant" },
								{ id: 7, role: "user" },
							],
						},
					]
				: [],
		);

		const result = await loadQuestHallData({ id: "user-1", name: "Fedor", activeLanguage: "fr", nativeLanguage: "en" }, "Asia/Shanghai");

		expect(mockEnsureCurrentLineups).toHaveBeenCalledWith("fr", "2026-04-20");
		expect(result).toMatchObject({
			activeLanguage: "fr",
			nativeLanguage: "en",
			levelSelfAssign: 3,
			localDate: "2026-04-20",
			localMonday: "2026-04-20",
			greeting: "fr:Fedor",
			subtitle: "fr:subtitle",
		});
		const { origin: _daily, ...daily } = dailyTask;
		const { origin: _weekly, ...weekly } = weeklyTask;
		expect(result.dailyTasks).toEqual([
			{ ...daily, lineupId: 1, sessionStatus: "evaluated", evaluationPhase: "completed", unreadCount: 2, hasUnreadReply: true },
		]);
		expect(result.weeklyTasks).toEqual([
			{ ...weekly, lineupId: 2, sessionStatus: null, evaluationPhase: null, unreadCount: 0, hasUnreadReply: false },
		]);
		for (const [query] of mockFindMany.mock.calls) {
			expect(containsCondition(query.where, { op: "eq", column: "practiceSession.userId", value: "user-1" })).toBe(true);
		}
		expect(() => JSON.stringify(result)).not.toThrow();
	});

	it("lists active translation tasks by creation month and prefers unfinished attempts in the status map", async () => {
		mockOrderBy
			.mockResolvedValueOnce([
				{ id: 42, title: "Newest translation", description: "A translated letter", difficulty: 2, createdAt: new Date("2026-04-30T18:00:00.000Z") },
				{ id: 41, title: "Older translation", description: null, difficulty: 1, createdAt: new Date("2026-03-01T12:00:00.000Z") },
			])
			.mockResolvedValueOnce([
				{ taskId: 42, status: "draft" },
				{ taskId: 42, status: "completed" },
				{ taskId: 41, status: "completed" },
			]);

		const result = await loadQuestHallData({ id: "user-1", name: "Fedor", activeLanguage: "fr", nativeLanguage: "en" }, "Asia/Shanghai");

		expect(result.translationTasks).toEqual([
			{ id: 42, title: "Newest translation", description: "A translated letter", difficulty: 2, createdMonth: "2026-05" },
			{ id: 41, title: "Older translation", description: null, difficulty: 1, createdMonth: "2026-03" },
		]);
		expect(result.translationStatusMap).toEqual({ 41: "completed", 42: "draft" });
		const translationScope = (mockWhere.mock.calls as unknown[][])[0]?.[0];
		expect(containsCondition(translationScope, { op: "eq", column: "task.interactionType", value: "translate" })).toBe(true);
		expect(containsCondition(translationScope, { op: "eq", column: "task.isActive", value: true })).toBe(true);
		const attemptScope = (mockWhere.mock.calls as unknown[][])[1]?.[0];
		expect(containsCondition(attemptScope, { op: "eq", column: "translationSourceSet.promptLanguage", value: "en" })).toBe(true);
		expect(containsCondition(attemptScope, { op: "inArray", column: "translationAttempt.taskId" })).toBe(true);
	});

	it("skips attempt and session reads when the user has no native language or lined-up tasks", async () => {
		mockListLineupTasks.mockResolvedValue([]);
		mockOrderBy.mockResolvedValueOnce([{ id: 42, title: "Letter", description: null, difficulty: 1, createdAt: new Date() }]);

		const result = await loadQuestHallData({ id: "user-2", name: "Ada", activeLanguage: "ja" }, "UTC");

		expect(result.nativeLanguage).toBeNull();
		expect(result.levelSelfAssign).toBe(2);
		expect(result.dailyTasks).toEqual([]);
		expect(result.weeklyTasks).toEqual([]);
		expect(result.translationStatusMap).toEqual({});
		expect(mockOrderBy).toHaveBeenCalledTimes(1);
		expect(mockFindMany).not.toHaveBeenCalled();
	});
});
