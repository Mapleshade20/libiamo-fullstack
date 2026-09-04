import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "$lib/server/auth/auth";
import { loadQuestHallData } from "$lib/server/quest-hall";
import { getQuestHallPreparation } from "$lib/server/quest-hall-preparation";
import { actions, load } from "$routes/(app)/+page.server";
import { runSwitchLanguageActionSuite } from "./action-test-helpers";

const { mockLoadQuestHallData, mockGetBrowserTimezone, mockGetQuestHallPreparation } = vi.hoisted(() => ({
	mockLoadQuestHallData: vi.fn(),
	mockGetBrowserTimezone: vi.fn(() => "Europe/Paris"),
	mockGetQuestHallPreparation: vi.fn(),
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

vi.mock("$lib/server/quest-hall-preparation", () => ({
	getQuestHallPreparation: mockGetQuestHallPreparation,
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
			initialPreparation: null,
		});
		expect(depends).toHaveBeenCalledWith("quest-hall:data");
		expect(mockGetBrowserTimezone).toHaveBeenCalledWith(cookies);
		expect(loadQuestHallData).toHaveBeenCalledWith(user, "Europe/Paris");
		expect(getQuestHallPreparation).not.toHaveBeenCalled();
	});

	it("server-loads the selected preparation for a direct Hall URL", async () => {
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
			dailyTasks: [
				{
					id: 7,
					title: "Daily quest",
					shortObjective: null,
					templateUi: "imessage",
					templateDifficulty: 1,
					templateInteractionType: "chat",
					pointReward: 5,
					sessionStatus: null,
					unreadCount: 0,
					hasUnreadReply: false,
				},
			],
			weeklyTasks: [],
			translationTasks: [],
			translationStatusMap: {},
		};
		const preparation = { kind: "quest", key: "daily-7", data: { task: { id: 7 }, nativeLanguage: "en" } };
		mockLoadQuestHallData.mockResolvedValue(hallData);
		mockGetQuestHallPreparation.mockResolvedValue(preparation);
		const cookies = { get: vi.fn() };
		const url = new URL("https://libiamo.test/?view=prepare&task=daily-7");

		await expect(load({ locals: { user }, cookies, depends: vi.fn(), url } as any)).resolves.toMatchObject({
			hallLocation: { view: "prepare", section: "daily", task: "daily-7" },
			initialPreparation: preparation,
		});
		expect(getQuestHallPreparation).toHaveBeenCalledWith({
			user,
			key: "daily-7",
			editionDate: "2026-04-17",
			browserTimezone: "Europe/Paris",
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
