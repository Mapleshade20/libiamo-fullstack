import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth";
import { actions, load } from "../../../src/routes/(app)/+page.server";
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

const { mockEnsureTasksForDate, mockGetMondayOfWeek, mockToDateString } = vi.hoisted(() => ({
	mockEnsureTasksForDate: vi.fn(),
	mockGetMondayOfWeek: vi.fn(() => new Date("2026-04-06T00:00:00.000Z")),
	mockToDateString: vi.fn((d: Date) => d.toISOString().slice(0, 10)),
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
		titleResolved: "titleResolved",
		descriptionResolved: "descriptionResolved",
		objectivesResolved: "objectivesResolved",
		date: "date",
		language: "language",
		templateId: "templateId",
	},
	template: {
		id: "id",
		type: "type",
		ui: "ui",
		difficulty: "difficulty",
		duration: "duration",
	},
	userLearningProfile: Symbol("userLearningProfile"),
}));

vi.mock("$lib/server/tasks", () => ({
	ensureTasksForDate: mockEnsureTasksForDate,
	getMondayOfWeek: mockGetMondayOfWeek,
	toDateString: mockToDateString,
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
		const weeklyTasks = [{ id: 1, titleResolved: "Weekly" }];
		const dailyTasks = [{ id: 2, titleResolved: "Daily" }];
		mockWhere.mockResolvedValueOnce(weeklyTasks).mockResolvedValueOnce(dailyTasks);

		const user = { id: "u1", activeLanguage: "en" };
		const result = await load({ locals: { user } } as any);

		expect(mockEnsureTasksForDate).toHaveBeenCalledTimes(1);
		expect(mockEnsureTasksForDate).toHaveBeenCalledWith("en", expect.any(Date));
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
			mockWhere.mockResolvedValue([]); // Prevent DB mock errors
			const user = { id: "u1", activeLanguage: "en" }; // No timezone set

			await load({ locals: { user } } as any);

			// Expected safe date anchored at 12:00 UTC for 2026-04-17
			expect(mockEnsureTasksForDate).toHaveBeenCalledWith(
				"en",
				new Date(Date.UTC(2026, 3, 17, 12, 0, 0)), // Month is 0-indexed (3 = April)
			);
		});

		it("should calculate local date correctly based on valid user timezone (e.g., Asia/Tokyo)", async () => {
			mockWhere.mockResolvedValue([]);
			const user = { id: "u1", activeLanguage: "en", timezone: "Asia/Tokyo" };

			// Set system time to late UTC, which pushes Tokyo (UTC+9) into the next day
			vi.setSystemTime(new Date("2026-04-17T20:00:00Z"));

			await load({ locals: { user } } as any);

			// Tokyo local date should be 2026-04-18
			expect(mockEnsureTasksForDate).toHaveBeenCalledWith("en", new Date(Date.UTC(2026, 3, 18, 12, 0, 0)));
		});

		it("should fallback to local toISOString if timezone is invalid and throws error", async () => {
			mockWhere.mockResolvedValue([]);
			const user = { id: "u1", activeLanguage: "en", timezone: "Invalid/Timezone" };

			// System time is 2026-04-17T10:00:00Z
			await load({ locals: { user } } as any);

			// Fallback logic uses sliced ISO string, resulting in 2026-04-17
			expect(mockEnsureTasksForDate).toHaveBeenCalledWith("en", new Date(Date.UTC(2026, 3, 17, 12, 0, 0)));
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
