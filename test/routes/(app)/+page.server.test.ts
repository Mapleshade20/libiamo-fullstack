import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth";
import { actions, load } from "$routes/(app)/+page.server";
import { runSwitchLanguageActionSuite } from "./action-test-helpers";

const { mockWhere, mockSelect, mockOnConflictDoNothing, mockValues, mockInsert } = vi.hoisted(() => {
	const mockWhere = vi.fn();
	const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
	const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	const mockOnConflictDoNothing = vi.fn();
	const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	return { mockWhere, mockInnerJoin, mockFrom, mockSelect, mockOnConflictDoNothing, mockValues, mockInsert };
});

const { mockEnsureTasksForDate } = vi.hoisted(() => ({
	mockEnsureTasksForDate: vi.fn(),
}));

const { mockGetMondayOfWeekForDate, mockGetLocalDateString } = vi.hoisted(() => ({
	mockGetMondayOfWeekForDate: vi.fn(() => "2026-04-13"),
	mockGetLocalDateString: vi.fn(() => "2026-04-17"),
}));

vi.mock("$lib/server/auth", () => ({
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
	},
	template: {
		id: "id",
		interactionType: "interactionType",
		ui: "ui",
		difficulty: "difficulty",
		cadence: "cadence",
	},
	userLearningProfile: Symbol("userLearningProfile"),
}));

vi.mock("$lib/server/tasks", () => ({
	ensureTasksForDate: mockEnsureTasksForDate,
}));

vi.mock("$lib/server/dates", () => ({
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

		const user = { id: "u1", activeLanguage: "en" };
		const result = await load({ locals: { user } } as any);

		expect(mockEnsureTasksForDate).toHaveBeenCalledTimes(1);
		expect(mockEnsureTasksForDate).toHaveBeenCalledWith("en", expect.any(String));
		expect(result).toEqual({
			weeklyTasks,
			dailyTasks,
			language: "en",
		});
	});

	// --- New tests for timezone logic ---
	describe("timezone logic", () => {
		beforeEach(() => {
			// Lock system time to prevent flaky tests
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-04-17T10:00:00Z"));
		});

		afterEach(() => {
			// Restore real timers after timezone tests
			vi.useRealTimers();
		});

		it("should use UTC as default timezone if user.timezone is missing", async () => {
			mockGetLocalDateString.mockReturnValue("2026-04-17");
			mockWhere.mockResolvedValue([]); // Prevent DB mock errors
			const user = { id: "u1", activeLanguage: "en" }; // No timezone set

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
