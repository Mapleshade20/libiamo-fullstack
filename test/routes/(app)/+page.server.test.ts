import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth/auth";
import { loadQuestHallData } from "$lib/server/quest-hall";
import { actions, load } from "$routes/(app)/+page.server";
import { runSwitchLanguageActionSuite } from "./action-test-helpers";

const { mockLoadQuestHallData, mockGetBrowserTimezone } = vi.hoisted(() => ({
	mockLoadQuestHallData: vi.fn(),
	mockGetBrowserTimezone: vi.fn(() => "Europe/Paris"),
}));

const { mockOnConflictDoNothing, mockValues, mockInsert } = vi.hoisted(() => {
	const mockOnConflictDoNothing = vi.fn();
	const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	return { mockOnConflictDoNothing, mockValues, mockInsert };
});

vi.mock("$lib/server/auth/auth", () => ({
	auth: {
		api: {
			updateUser: vi.fn(),
		},
	},
}));

vi.mock("$lib/server/browser-timezone", () => ({
	getBrowserTimezone: mockGetBrowserTimezone,
}));

vi.mock("$lib/server/quest-hall", () => ({
	loadQuestHallData: mockLoadQuestHallData,
}));

vi.mock("$lib/server/db", () => ({
	db: {
		insert: mockInsert,
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	userLearningProfile: Symbol("userLearningProfile"),
}));

describe("(app) home +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetBrowserTimezone.mockReturnValue("Europe/Paris");
	});

	it("redirects unauthenticated users before loading Hall data", async () => {
		await expect(load({ locals: { user: null } } as any)).rejects.toMatchObject({
			status: 302,
			location: "/sign-in",
		});
		expect(mockLoadQuestHallData).not.toHaveBeenCalled();
	});

	it("loads the Hall service for the authenticated user and browser timezone", async () => {
		const user = { id: "u1", name: "Fedor", activeLanguage: "fr", nativeLanguage: "en" };
		const hallData = {
			activeLanguage: "fr",
			nativeLanguage: "en",
			localDate: "2026-04-17",
			localMonday: "2026-04-13",
			editionDate: "2026-04-17",
			translationMonth: "2026-04",
			greeting: "Bonjour, Fedor",
			subtitle: "Choose a quest",
			dailyTasks: [],
			weeklyTasks: [],
			translationTasks: [],
			translationStatusMap: {},
		};
		mockLoadQuestHallData.mockResolvedValue(hallData);
		const cookies = { get: vi.fn() };
		const depends = vi.fn();
		const url = new URL("https://libiamo.test/?view=catalog&section=weekly&leaf=9");

		await expect(load({ locals: { user }, cookies, depends, url } as any)).resolves.toEqual({
			...hallData,
			hallLocation: { view: "catalog", section: "weekly", leaf: 1, task: null },
		});
		expect(depends).toHaveBeenCalledWith("quest-hall:data");
		expect(mockGetBrowserTimezone).toHaveBeenCalledWith(cookies);
		expect(loadQuestHallData).toHaveBeenCalledWith(user, "Europe/Paris");
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
