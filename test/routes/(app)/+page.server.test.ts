import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth/auth";
import { actions, load } from "$routes/(app)/+page.server";
import { runSwitchLanguageActionSuite } from "./action-test-helpers";

const { mockWhere, mockSelect, mockFindMany, mockOnConflictDoNothing, mockValues, mockInsert, mockOrderBy } = vi.hoisted(() => {
	const mockWhere = vi.fn();
	const mockOrderBy = vi.fn();
	const mockLeftJoin = vi.fn(() => ({ where: mockWhere }));
	const mockInnerJoin = vi.fn(() => ({ leftJoin: mockLeftJoin, where: mockWhere }));
	const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin, where: mockWhere }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	const mockFindMany = vi.fn();
	const mockOnConflictDoNothing = vi.fn();
	const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	return { mockWhere, mockInnerJoin, mockFrom, mockSelect, mockFindMany, mockOnConflictDoNothing, mockValues, mockInsert, mockLeftJoin, mockOrderBy };
});

const { mockEnsureTasksForDate } = vi.hoisted(() => ({
	mockEnsureTasksForDate: vi.fn(),
}));

const { mockGetMondayOfWeekForDate, mockGetLocalDateString } = vi.hoisted(() => ({
	mockGetMondayOfWeekForDate: vi.fn(() => "2026-04-13"),
	mockGetLocalDateString: vi.fn(() => "2026-04-17"),
}));

vi.mock("$lib/server/auth/auth", () => ({
	auth: {
		api: {
			updateUser: vi.fn(),
		},
	},
}));

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
		insert: mockInsert,
		query: {
			practiceSession: {
				findMany: mockFindMany,
			},
		},
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	task: {
		id: "id",
		title: "title",
		shortObjective: "shortObjective",
		description: "description",
		objectives: "objectives",
		date: "date",
		language: "language",
		templateId: "templateId",
		cadence: "cadence",
	},
	template: {
		id: "id",
		titleBase: "titleBase",
		descriptionBase: "descriptionBase",
		interactionType: "interactionType",
		ui: "ui",
		difficulty: "difficulty",
		pointReward: "pointReward",
		cadence: "cadence",
		language: "template.language",
		isActive: "isActive",
		createdAt: "createdAt",
	},
	userLearningProfile: Symbol("userLearningProfile"),
	practiceSession: {
		status: "status",
		taskId: "taskId",
		userId: "userId",
	},
	translationAttempt: {
		sourceSetId: "translationAttempt.sourceSetId",
		workflowPhase: "workflowPhase",
		userId: "translationAttempt.userId",
		updatedAt: "translationAttempt.updatedAt",
	},
	translationSourceSet: {
		id: "translationSourceSet.id",
		templateId: "translationSourceSet.templateId",
		promptLanguage: "translationSourceSet.promptLanguage",
	},
}));

vi.mock("$lib/server/scheduling/tasks", () => ({
	ensureTasksForDate: mockEnsureTasksForDate,
}));

vi.mock("$lib/server/scheduling/dates", () => ({
	getMondayOfWeekForDate: mockGetMondayOfWeekForDate,
	getLocalDateString: mockGetLocalDateString,
}));

describe("(app) home +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects unauthenticated users", async () => {
		await expect(load({ locals: { user: null } } as any)).rejects.toMatchObject({
			status: 302,
			location: "/sign-in",
		});
	});

	it("loads weekly and daily tasks for active language", async () => {
		const weeklyTasks = [{ id: 1, title: "Weekly" }];
		const dailyTasks = [{ id: 2, title: "Daily" }];
		const translationTasks = [
			{ id: 3, titleBase: "Translate a letter", descriptionBase: "Translate a personal letter.", createdAt: new Date("2026-04-08T12:00:00.000Z") },
		];
		mockWhere.mockResolvedValueOnce(weeklyTasks).mockResolvedValueOnce(dailyTasks).mockResolvedValueOnce(translationTasks);
		mockFindMany.mockResolvedValueOnce([
			{ id: 1001, taskId: 1, status: "evaluated", startedAt: new Date("2026-04-17T10:00:00.000Z") },
			{ id: 1002, taskId: 2, status: "in_progress", startedAt: new Date("2026-04-17T11:00:00.000Z") },
		]);

		const user = { id: "u1", activeLanguage: "en" };
		const result = await load({ locals: { user } } as any);

		expect(mockEnsureTasksForDate).toHaveBeenCalledTimes(1);
		expect(mockEnsureTasksForDate).toHaveBeenCalledWith("en", expect.any(String));
		expect(result).toEqual(
			expect.objectContaining({
				weeklyTasks: [{ ...weeklyTasks[0], sessionStatus: "evaluated" }],
				dailyTasks: [{ ...dailyTasks[0], sessionStatus: "in_progress" }],
				translationTasks: [{ id: 3, titleBase: "Translate a letter", descriptionBase: "Translate a personal letter.", createdMonth: "2026-04" }],
				translationMonth: "2026-04",
				editionDate: "2026-04-17",
			}),
		);
	});

	it("loads translation tasks from every creation month and keeps the latest attempt status", async () => {
		mockWhere
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: 7, titleBase: "A poem", createdAt: new Date("2025-12-04T12:00:00.000Z") }]);
		mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValueOnce([
			{ templateId: 7, status: "correction" },
			{ templateId: 7, status: "draft" },
		]);

		const result = await load({
			locals: { user: { id: "u1", activeLanguage: "en", nativeLanguage: "fr" } },
		} as any);

		expect(result).toEqual(
			expect.objectContaining({
				translationMonth: "2026-04",
				translationTasks: [{ id: 7, titleBase: "A poem", createdMonth: "2025-12" }],
				translationStatusMap: { 7: "correction" },
			}),
		);
	});

	describe("timezone logic", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-04-17T10:00:00Z"));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should use UTC as default timezone if user.timezone is missing", async () => {
			mockGetLocalDateString.mockReturnValue("2026-04-17");
			mockWhere.mockResolvedValue([]);
			const user = { id: "u1", activeLanguage: "en" };

			await load({ locals: { user } } as any);

			expect(mockGetLocalDateString).toHaveBeenCalledWith("UTC");
			expect(mockEnsureTasksForDate).toHaveBeenCalledWith("en", "2026-04-17");
		});

		it("should calculate local date correctly based on valid user timezone (e.g., Asia/Tokyo)", async () => {
			mockGetLocalDateString.mockReturnValue("2026-04-18");
			mockWhere.mockResolvedValue([]);
			const user = { id: "u1", activeLanguage: "en", timezone: "Asia/Tokyo" };

			await load({ locals: { user } } as any);

			expect(mockGetLocalDateString).toHaveBeenCalledWith("Asia/Tokyo");
			expect(mockEnsureTasksForDate).toHaveBeenCalledWith("en", "2026-04-18");
		});

		it("should fallback gracefully if timezone is invalid", async () => {
			mockGetLocalDateString.mockReturnValue("2026-04-17");
			mockWhere.mockResolvedValue([]);
			const user = { id: "u1", activeLanguage: "en", timezone: "Invalid/Timezone" };

			await load({ locals: { user } } as any);

			expect(mockGetLocalDateString).toHaveBeenCalledWith("Invalid/Timezone");
			expect(mockEnsureTasksForDate).toHaveBeenCalledWith("en", "2026-04-17");
		});
	});

	runSwitchLanguageActionSuite({
		action: actions.switchLanguage,
		updateUser: auth.api.updateUser as any,
		mockInsert,
		mockValues,
		mockOnConflictDoNothing,
		successLanguage: "ja",
	});
});
