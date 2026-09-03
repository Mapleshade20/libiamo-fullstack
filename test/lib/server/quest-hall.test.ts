import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadQuestHallData } from "$lib/server/quest-hall";

const { mockSelect, mockWhere, mockOrderBy, mockFindMany } = vi.hoisted(() => {
	const mockOrderBy = vi.fn();
	const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
	const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
	const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin, where: mockWhere }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	const mockFindMany = vi.fn();
	return { mockSelect, mockWhere, mockOrderBy, mockFindMany };
});

const { mockEnsureTasksForDate, mockGetGreeting, mockGetRandomSubtitle } = vi.hoisted(() => ({
	mockEnsureTasksForDate: vi.fn(),
	mockGetGreeting: vi.fn((language: string, name: string) => `${language}:${name}`),
	mockGetRandomSubtitle: vi.fn((language: string) => `${language}:subtitle`),
}));

vi.mock("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ op: "and", conditions }),
	asc: (column: unknown) => ({ op: "asc", column }),
	desc: (column: unknown) => ({ op: "desc", column }),
	eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
	inArray: (column: unknown, values: unknown[]) => ({ op: "inArray", column, values }),
}));

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
		query: {
			practiceSession: {
				findMany: mockFindMany,
			},
		},
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	task: {
		id: "task.id",
		title: "task.title",
		shortObjective: "task.shortObjective",
		language: "task.language",
		date: "task.date",
		cadence: "task.cadence",
		templateId: "task.templateId",
	},
	template: {
		id: "template.id",
		titleBase: "template.titleBase",
		descriptionBase: "template.descriptionBase",
		difficulty: "template.difficulty",
		ui: "template.ui",
		interactionType: "template.interactionType",
		pointReward: "template.pointReward",
		language: "template.language",
		isActive: "template.isActive",
		createdAt: "template.createdAt",
	},
	practiceSession: {
		id: "practiceSession.id",
		userId: "practiceSession.userId",
		taskId: "practiceSession.taskId",
	},
	translationAttempt: {
		id: "translationAttempt.id",
		userId: "translationAttempt.userId",
		sourceSetId: "translationAttempt.sourceSetId",
		workflowPhase: "translationAttempt.workflowPhase",
		updatedAt: "translationAttempt.updatedAt",
	},
	translationSourceSet: {
		id: "translationSourceSet.id",
		templateId: "translationSourceSet.templateId",
		promptLanguage: "translationSourceSet.promptLanguage",
	},
}));

vi.mock("$lib/server/greetings", () => ({
	getGreeting: mockGetGreeting,
	getRandomSubtitle: mockGetRandomSubtitle,
}));

vi.mock("$lib/server/scheduling/tasks", () => ({
	ensureTasksForDate: mockEnsureTasksForDate,
}));

const weeklyTask = {
	id: 20,
	title: "Weekly",
	shortObjective: "Weekly objective",
	templateUi: "apple_mail" as const,
	templateDifficulty: 2,
	templateInteractionType: "chat" as const,
	pointReward: 5,
};

const dailyTask = {
	id: 10,
	title: "Daily",
	shortObjective: "Daily objective",
	templateUi: "imessage" as const,
	templateDifficulty: 1,
	templateInteractionType: "chat" as const,
	pointReward: 5,
};

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
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("loads stable, user-scoped Hall facts at the browser-local day and week boundary", async () => {
		const firstTranslationCreatedAt = new Date("2026-04-30T18:00:00.000Z");
		mockOrderBy
			.mockResolvedValueOnce([weeklyTask])
			.mockResolvedValueOnce([dailyTask])
			.mockResolvedValueOnce([
				{
					id: 42,
					titleBase: "Newest translation",
					descriptionBase: "A translated letter",
					difficulty: 2,
					createdAt: firstTranslationCreatedAt,
				},
				{
					id: 41,
					titleBase: "Older translation",
					descriptionBase: null,
					difficulty: 1,
					createdAt: new Date("2026-03-01T12:00:00.000Z"),
				},
			])
			.mockResolvedValueOnce([
				{ templateId: 42, status: "correction" },
				{ templateId: 42, status: "draft" },
				{ templateId: 41, status: "completed" },
			]);
		mockFindMany.mockResolvedValue([
			{
				id: 200,
				taskId: 10,
				status: "evaluated",
				startedAt: new Date("2026-04-20T08:00:00.000Z"),
				lastSeenAssistantMessageId: 4,
				messages: [
					{ id: 3, role: "assistant" },
					{ id: 5, role: "assistant" },
					{ id: 6, role: "assistant" },
					{ id: 7, role: "user" },
				],
			},
			{
				id: 199,
				taskId: 10,
				status: "in_progress",
				startedAt: new Date("2026-04-19T08:00:00.000Z"),
				lastSeenAssistantMessageId: null,
				messages: [{ id: 1, role: "assistant" }],
			},
		]);

		const result = await loadQuestHallData({ id: "user-1", name: "Fedor", activeLanguage: "fr", nativeLanguage: "en" }, "Asia/Shanghai");

		expect(mockEnsureTasksForDate).toHaveBeenCalledTimes(1);
		expect(mockEnsureTasksForDate).toHaveBeenCalledWith("fr", "2026-04-20");
		expect(result).toEqual({
			activeLanguage: "fr",
			nativeLanguage: "en",
			localDate: "2026-04-20",
			localMonday: "2026-04-20",
			editionDate: "2026-04-20",
			translationMonth: "2026-04",
			greeting: "fr:Fedor",
			subtitle: "fr:subtitle",
			weeklyTasks: [{ ...weeklyTask, sessionStatus: null, unreadCount: 0, hasUnreadReply: false }],
			dailyTasks: [{ ...dailyTask, sessionStatus: "evaluated", unreadCount: 2, hasUnreadReply: true }],
			translationTasks: [
				{
					id: 42,
					titleBase: "Newest translation",
					descriptionBase: "A translated letter",
					difficulty: 2,
					createdMonth: "2026-05",
				},
				{
					id: 41,
					titleBase: "Older translation",
					descriptionBase: null,
					difficulty: 1,
					createdMonth: "2026-03",
				},
			],
			translationStatusMap: { 41: "completed", 42: "correction" },
		});
		expect(() => JSON.stringify(result)).not.toThrow();

		expect(mockOrderBy.mock.calls[0]).toEqual([{ op: "asc", column: "task.id" }]);
		expect(mockOrderBy.mock.calls[1]).toEqual([{ op: "asc", column: "task.id" }]);
		expect(mockOrderBy.mock.calls[2]).toEqual([
			{ op: "desc", column: "template.createdAt" },
			{ op: "desc", column: "template.id" },
		]);
		expect(mockOrderBy.mock.calls[3]).toEqual([
			{ op: "desc", column: "translationAttempt.updatedAt" },
			{ op: "desc", column: "translationAttempt.id" },
		]);

		const attemptScope = (mockWhere.mock.calls as unknown[][])[3]?.[0];
		expect(containsCondition(attemptScope, { op: "eq", column: "translationAttempt.userId", value: "user-1" })).toBe(true);
		expect(containsCondition(attemptScope, { op: "eq", column: "translationSourceSet.promptLanguage", value: "en" })).toBe(true);

		const sessionQuery = mockFindMany.mock.calls[0]?.[0];
		expect(containsCondition(sessionQuery.where, { op: "eq", column: "practiceSession.userId", value: "user-1" })).toBe(true);
		expect(containsCondition(sessionQuery.where, { op: "inArray", column: "practiceSession.taskId" })).toBe(true);
		expect(
			sessionQuery.orderBy({ startedAt: "sessions.startedAt", id: "sessions.id" }, { desc: (column: unknown) => ({ op: "desc", column }) }),
		).toEqual([
			{ op: "desc", column: "sessions.startedAt" },
			{ op: "desc", column: "sessions.id" },
		]);
	});

	it("skips attempt and session reads when the user has no native language or scheduled tasks", async () => {
		mockOrderBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

		const result = await loadQuestHallData({ id: "user-2", name: "Ada", activeLanguage: "ja" }, "UTC");

		expect(result.nativeLanguage).toBeNull();
		expect(result.dailyTasks).toEqual([]);
		expect(result.weeklyTasks).toEqual([]);
		expect(result.translationStatusMap).toEqual({});
		expect(mockOrderBy).toHaveBeenCalledTimes(3);
		expect(mockFindMany).not.toHaveBeenCalled();
	});
});
