import { describe, expect, it } from "vitest";
import type { HallQuest, HallQuestSessionStatus } from "$lib/quest-hall";
import {
	adaptHallDataToQuestMenu,
	buildQuestMenuSpreads,
	deriveQuestMenuRecommendations,
	getQuestMenuFolio,
	getQuestMenuItemHref,
	getQuestMenuItemId,
	getQuestMenuItemKey,
	getQuestMenuItemSection,
	getQuestMenuNarrowTarget,
	getQuestMenuSpread,
	getQuestMenuTurnTarget,
	getQuestMenuUnreadCount,
	type QuestMenuItem,
} from "$lib/quest-hall/menu";
import type { HallData } from "$lib/server/quest-hall";

function quest(id: number, sessionStatus: HallQuestSessionStatus = null, overrides: Partial<HallQuest> = {}): HallQuest {
	return {
		id,
		title: `Task ${id}`,
		shortObjective: `Objective ${id}`,
		templateUi: "imessage",
		templateDifficulty: 2,
		templateInteractionType: "chat",
		pointReward: 5,
		sessionStatus,
		unreadCount: 0,
		hasUnreadReply: false,
		...overrides,
	};
}

function hallData(overrides: Partial<HallData> = {}): HallData {
	return {
		activeLanguage: "en",
		nativeLanguage: "fr",
		localDate: "2026-09-04",
		localMonday: "2026-08-31",
		editionDate: "2026-09-04",
		translationMonth: "2026-09",
		greeting: "Welcome back",
		subtitle: "Choose a quest",
		dailyTasks: [quest(1), quest(2), quest(3), quest(4)],
		weeklyTasks: [quest(11), quest(12)],
		translationTasks: [
			{ id: 21, titleBase: "Letter", descriptionBase: "A short letter", difficulty: 1, createdMonth: "2026-09" },
			{ id: 22, titleBase: "Older month", descriptionBase: null, difficulty: 2, createdMonth: "2026-08" },
		],
		translationStatusMap: { "21": "draft", "22": "completed" },
		...overrides,
	};
}

function items(count: number): QuestMenuItem[] {
	return adaptHallDataToQuestMenu(hallData({ dailyTasks: Array.from({ length: count }, (_, index) => quest(index + 1)) })).sections.daily;
}

describe("Quest menu production adaptation", () => {
	it("adapts real statuses and the current translation month without mutating Hall data", () => {
		const source = hallData({
			dailyTasks: [
				quest(1, null, { unreadCount: 2, hasUnreadReply: true }),
				quest(2, "in_progress"),
				quest(3, "evaluated"),
				quest(4, "abandoned"),
				quest(5, null, { templateUi: "translator" }),
			],
		});
		const before = structuredClone(source);
		const catalog = adaptHallDataToQuestMenu(source);

		expect(catalog.sections.daily.map((item) => item.state)).toEqual(["ready", "active", "finished", "stopped", "informational"]);
		expect(catalog.sections.translation).toHaveLength(1);
		expect(catalog.sections.translation[0]).toMatchObject({ key: "translation-21", state: "active", workflowPhase: "draft" });
		expect(source).toEqual(before);
		expect(catalog.sections.daily[0]).not.toBe(source.dailyTasks[0]);
		expect(getQuestMenuUnreadCount(catalog)).toBe(2);
	});

	it("rebuilds translation spreads for the selected month and clamps stale leaves", () => {
		const data = hallData({
			translationTasks: [
				...Array.from({ length: 8 }, (_, index) => ({
					id: 30 + index,
					titleBase: `September ${index + 1}`,
					descriptionBase: null,
					difficulty: 1,
					createdMonth: "2026-09",
				})),
				{ id: 50, titleBase: "August", descriptionBase: null, difficulty: 2, createdMonth: "2026-08" },
			],
		});

		const september = adaptHallDataToQuestMenu(data, "2026-09");
		const august = adaptHallDataToQuestMenu(data, "2026-08");
		const empty = adaptHallDataToQuestMenu(data, "2026-07");

		expect(september.sections.translation).toHaveLength(8);
		expect(september.spreads.translation).toHaveLength(3);
		expect(august.sections.translation.map((item) => item.key)).toEqual(["translation-50"]);
		expect(getQuestMenuSpread(august, "translation", 3).leaf).toBe(1);
		expect(empty.spreads.translation).toHaveLength(1);
		expect(empty.spreads.translation[0].items).toEqual([]);
	});

	it("can recommend unfinished translation work from an older month", () => {
		const catalog = adaptHallDataToQuestMenu(
			hallData({
				dailyTasks: [],
				weeklyTasks: [quest(11)],
				translationStatusMap: { "22": "draft" },
			}),
			"2026-09",
		);

		expect(catalog.sections.translation.map((item) => item.key)).toEqual(["translation-21"]);
		expect(catalog.recommendations.map((item) => item.key)).toEqual(["translation-22", "weekly-11"]);
	});

	it("uses stable keys and canonical production detail links", () => {
		const catalog = adaptHallDataToQuestMenu(hallData());
		expect(getQuestMenuItemKey("daily", 31)).toBe("daily-31");
		expect(getQuestMenuItemSection("translation-21")).toBe("translation");
		expect(getQuestMenuItemSection("daily-0")).toBeNull();
		expect(getQuestMenuItemId("weekly-12")).toBe(12);
		expect(() => getQuestMenuItemKey("daily", 0)).toThrow(RangeError);
		expect(getQuestMenuItemHref(catalog.sections.daily[0], "/libiamo")).toBe("/libiamo/task/1");
		expect(getQuestMenuItemHref(catalog.sections.translation[0], "/libiamo")).toBe("/libiamo/translate/21");
	});

	it("prioritizes unread and active work while preferring a second section", () => {
		const catalog = adaptHallDataToQuestMenu(
			hallData({
				dailyTasks: [quest(1, "evaluated", { unreadCount: 1, hasUnreadReply: true }), quest(2)],
				weeklyTasks: [quest(11)],
				translationStatusMap: {},
			}),
		);
		expect(catalog.recommendations.map((item) => item.key)).toEqual(["daily-1", "weekly-11"]);

		const simultaneous = adaptHallDataToQuestMenu(hallData({ dailyTasks: [quest(1, "in_progress"), quest(2, "in_progress")], weeklyTasks: [] }));
		expect(simultaneous.recommendations.map((item) => item.key)).toEqual(["daily-1", "daily-2"]);
	});

	it("omits finished work from recommendations unless it has unread replies", () => {
		const catalog = adaptHallDataToQuestMenu(
			hallData({
				dailyTasks: [quest(1, "completed")],
				weeklyTasks: [quest(11, "evaluated")],
				translationTasks: [],
			}),
		);
		expect(deriveQuestMenuRecommendations(catalog.sections)).toEqual([]);
	});
});

describe("Quest menu production pagination", () => {
	it.each([
		[0, [[0, 0]]],
		[1, [[1, 0]]],
		[2, [[1, 1]]],
		[3, [[1, 2]]],
		[
			4,
			[
				[1, 2],
				[1, 0],
			],
		],
		[
			5,
			[
				[1, 2],
				[2, 0],
			],
		],
		[
			7,
			[
				[1, 2],
				[2, 2],
			],
		],
		[
			8,
			[
				[1, 2],
				[2, 2],
				[1, 0],
			],
		],
		[
			9,
			[
				[1, 2],
				[2, 2],
				[2, 0],
			],
		],
	] as const)("lays out %i items as the approved physical pages", (count, expected) => {
		expect(buildQuestMenuSpreads(items(count)).map((spread) => [spread.leftItems.length, spread.rightItems.length])).toEqual(expected);
	});

	it("keeps empty sections and shared global folios", () => {
		const empty = adaptHallDataToQuestMenu(hallData({ dailyTasks: [], weeklyTasks: [], translationTasks: [] }));
		expect(empty.spreads.daily).toHaveLength(1);
		expect(empty.spreads.weekly).toHaveLength(1);
		expect(empty.spreads.translation).toHaveLength(1);
		expect(getQuestMenuFolio(empty, "translation", 1)).toEqual({ current: 3, total: 3 });

		const catalog = adaptHallDataToQuestMenu(hallData());
		expect(getQuestMenuFolio(catalog, "daily", 1)).toEqual({ current: 1, total: 4 });
		expect(getQuestMenuFolio(catalog, "weekly", 1)).toEqual({ current: 3, total: 4 });
		expect(getQuestMenuFolio(catalog, "translation", 1)).toEqual({ current: 4, total: 4 });
		expect(getQuestMenuSpread(catalog, "daily", 99).leaf).toBe(2);
	});

	it("turns symmetrically across section boundaries", () => {
		const catalog = adaptHallDataToQuestMenu(hallData());
		expect(getQuestMenuTurnTarget(catalog, "daily", 2, 1)).toEqual({ section: "weekly", leaf: 1 });
		expect(getQuestMenuTurnTarget(catalog, "weekly", 1, -1)).toEqual({ section: "daily", leaf: 2 });
		expect(getQuestMenuTurnTarget(catalog, "daily", 1, -1)).toBeNull();
		expect(getQuestMenuTurnTarget(catalog, "translation", 1, 1)).toBeNull();
	});

	it("traverses narrow items backward across a spread and section boundary", () => {
		const catalog = adaptHallDataToQuestMenu(hallData());
		expect(getQuestMenuNarrowTarget(catalog, "daily", 1, "daily-3", -1)).toEqual({ section: "daily", leaf: 1, itemKey: "daily-2" });
		expect(getQuestMenuNarrowTarget(catalog, "weekly", 1, "weekly-11", -1)).toEqual({ section: "daily", leaf: 2, itemKey: "daily-4" });
		expect(getQuestMenuNarrowTarget(catalog, "daily", 1, "daily-1", -1)).toBeNull();
	});
});
