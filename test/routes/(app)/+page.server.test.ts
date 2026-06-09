import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth/auth";
import { actions, load } from "$routes/(app)/+page.server";
import { runSwitchLanguageActionSuite } from "./action-test-helpers";

const { mockWhere, mockSelect, mockFindMany, mockOnConflictDoNothing, mockValues, mockInsert } = vi.hoisted(() => {
	const mockWhere = vi.fn();
	const mockLeftJoin = vi.fn(() => ({ where: mockWhere }));
	const mockInnerJoin = vi.fn(() => ({ leftJoin: mockLeftJoin, where: mockWhere }));
	const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	const mockFindMany = vi.fn();
	const mockOnConflictDoNothing = vi.fn();
	const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	return { mockWhere, mockInnerJoin, mockFrom, mockSelect, mockFindMany, mockOnConflictDoNothing, mockValues, mockInsert, mockLeftJoin };
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
		interactionType: "interactionType",
		ui: "ui",
		difficulty: "difficulty",
		cadence: "cadence",
	},
	userLearningProfile: Symbol("userLearningProfile"),
	practiceSession: {
		status: "status",
		taskId: "taskId",
		userId: "userId",
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
		mockWhere.mockResolvedValueOnce(weeklyTasks).mockResolvedValueOnce(dailyTasks);
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
				language: "en",
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
