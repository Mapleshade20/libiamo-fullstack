import { beforeEach, describe, expect, it, vi } from "vitest";
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
		const weeklyTasks = [{ id: 1, title: "Weekly" }];
		const dailyTasks = [{ id: 2, title: "Daily" }];
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

	runSwitchLanguageActionSuite({
		action: actions.switchLanguage,
		updateUser: auth.api.updateUser as any,
		mockInsert,
		mockValues,
		mockOnConflictDoNothing,
		successLanguage: "ja",
	});
});
