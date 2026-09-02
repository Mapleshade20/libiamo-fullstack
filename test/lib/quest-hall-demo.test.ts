import { describe, expect, it } from "vitest";
import type { HallQuest, HallQuestSessionStatus } from "$lib/quest-hall";
import {
	applyQuestHallDemoScenario,
	applyQuestHallDemoState,
	DEFAULT_QUEST_HALL_DEMO_URL_STATE,
	deriveQuestHallDemoBookSpreads,
	deriveQuestHallDemoRecommendations,
	getQuestHallDemoCatalogPagePosition,
	getQuestHallDemoCatalogTurnTarget,
	getQuestHallDemoTaskKey,
	getQuestHallDemoTaskSection,
	getQuestHallDemoUnreadReplyCount,
	normalizeQuestHallDemoUrlState,
	parseQuestHallDemoState,
	parseQuestHallDemoUrlState,
	type QuestHallDemoData,
	reduceQuestHallDemoState,
	serializeQuestHallDemoUrlState,
} from "$lib/quest-hall-demo";

function makeQuest(id: number, sessionStatus: HallQuestSessionStatus = null): HallQuest {
	return {
		id,
		title: `Task ${id}`,
		shortObjective: null,
		templateUi: "imessage",
		templateDifficulty: 1,
		templateInteractionType: "chat",
		pointReward: 5,
		sessionStatus,
		unreadCount: 2,
		hasUnreadReply: true,
	};
}

function makeData(): QuestHallDemoData {
	return {
		dailyTasks: [makeQuest(1), makeQuest(2), makeQuest(3), makeQuest(4)],
		weeklyTasks: [makeQuest(11), makeQuest(12)],
		translationTasks: [
			{ id: 21, titleBase: "Letter", descriptionBase: "A short letter", difficulty: 1, createdMonth: "2026-09" },
			{ id: 22, titleBase: "Reply", descriptionBase: null, difficulty: 2, createdMonth: "2026-09" },
		],
		translationStatusMap: { "21": "draft", "22": "completed" },
		translationMonth: "2026-09",
		editionDate: "2026-09-01",
		greeting: "Bonjour",
		subtitle: "Choisissez une quête",
	};
}

describe("Quest Hall demo URL state", () => {
	it("uses one deterministic default state", () => {
		expect(parseQuestHallDemoUrlState("")).toEqual(DEFAULT_QUEST_HALL_DEMO_URL_STATE);
		expect(serializeQuestHallDemoUrlState({ ...DEFAULT_QUEST_HALL_DEMO_URL_STATE })).toBe("");
	});

	it("parses and serializes every orthogonal URL dimension", () => {
		const parsed = parseQuestHallDemoUrlState(
			"?scenario=feedback-unread&view=prepare&section=weekly&leaf=2&task=daily-3&resource=error&motion=reduce",
		);

		expect(parsed).toEqual({
			scenario: "feedback-unread",
			view: "prepare",
			section: "daily",
			leaf: 2,
			task: "daily-3",
			resource: "error",
			motion: "reduce",
		});
		expect(parseQuestHallDemoUrlState(serializeQuestHallDemoUrlState(parsed))).toEqual(parsed);
	});

	it("accepts full URLs and the legacy demoState query", () => {
		expect(parseQuestHallDemoUrlState("https://example.test/demo?demoState=all-complete#preview").scenario).toBe("all-complete");
	});

	it("normalizes malformed leaves, task keys, and prepare states", () => {
		expect(parseQuestHallDemoUrlState("?view=prepare&leaf=-4&task=not-a-task")).toMatchObject({ view: "catalog", leaf: 1, task: null });
		expect(normalizeQuestHallDemoUrlState({ leaf: 1.5 })).toEqual(DEFAULT_QUEST_HALL_DEMO_URL_STATE);
	});

	it("can serialize defaults explicitly in a stable order", () => {
		expect(serializeQuestHallDemoUrlState({ ...DEFAULT_QUEST_HALL_DEMO_URL_STATE }, true)).toBe(
			"scenario=mixed&view=home&section=daily&leaf=1&resource=ready&motion=system",
		);
	});
});

describe("Quest Hall demo scenarios", () => {
	it("applies a deterministic mixed overlay without mutating source tasks", () => {
		const data = makeData();
		const result = applyQuestHallDemoScenario(data, "mixed");

		expect(result.dailyTasks.map((task) => task.sessionStatus)).toEqual(["completed", null, "in_progress", null]);
		expect(result.weeklyTasks.map((task) => task.sessionStatus)).toEqual([null, null]);
		expect(result.translationStatusMap).toEqual({});
		expect(data.dailyTasks.map((task) => task.sessionStatus)).toEqual([null, null, null, null]);
		expect(data.dailyTasks[0].hasUnreadReply).toBe(true);
		expect(result.dailyTasks.every((task) => !task.hasUnreadReply && task.unreadCount === null)).toBe(true);
	});

	it("keeps completion and unread feedback as simultaneous state", () => {
		const result = applyQuestHallDemoScenario(makeData(), "feedback-unread");
		expect(result.dailyTasks[0]).toMatchObject({ sessionStatus: "evaluated", hasUnreadReply: true, unreadCount: 1 });
		expect(result.dailyTasks.slice(1).every((task) => task.sessionStatus === null && !task.hasUnreadReply)).toBe(true);
		expect(getQuestHallDemoUnreadReplyCount(result)).toBe(1);
	});

	it("counts unread replies rather than tasks with unread state", () => {
		expect(getQuestHallDemoUnreadReplyCount(makeData())).toBe(12);
	});

	it("marks every section complete in the all-complete scenario", () => {
		const result = applyQuestHallDemoScenario(makeData(), "all-complete");
		expect(result.dailyTasks.every((task) => task.sessionStatus === "completed")).toBe(true);
		expect(result.weeklyTasks.every((task) => task.sessionStatus === "completed")).toBe(true);
		expect(result.translationStatusMap).toEqual({ "21": "completed", "22": "completed" });
		expect(deriveQuestHallDemoRecommendations(result)).toEqual([]);
	});

	it.each([
		["daily-empty", "dailyTasks"],
		["weekly-empty", "weeklyTasks"],
		["translation-empty", "translationTasks"],
	] as const)("supports the %s scenario", (scenario, property) => {
		expect(applyQuestHallDemoScenario(makeData(), scenario)[property]).toEqual([]);
	});

	it("does not invent a third task when the source has fewer than three", () => {
		const data = makeData();
		data.dailyTasks = data.dailyTasks.slice(0, 2);
		expect(applyQuestHallDemoScenario(data, "mixed").dailyTasks.map((task) => task.sessionStatus)).toEqual(["completed", null]);
	});

	it("offers a five-task overflow scenario without inventing database ids", () => {
		const data = makeData();
		const result = applyQuestHallDemoScenario(data, "daily-five");
		expect(result.dailyTasks.map((task) => task.id)).toEqual([1, 2, 3, 4, 11]);
		expect(data.dailyTasks.map((task) => task.id)).toEqual([1, 2, 3, 4]);
	});
});

describe("Quest Hall demo item derivation", () => {
	it("creates stable task keys and recovers their section", () => {
		expect(getQuestHallDemoTaskKey("daily", 31)).toBe("daily-31");
		expect(getQuestHallDemoTaskSection("translation-22")).toBe("translation");
		expect(getQuestHallDemoTaskSection("broken-22")).toBeNull();
		expect(() => getQuestHallDemoTaskKey("daily", -1)).toThrow(RangeError);
	});

	it("recommends at most two unfinished tasks, prioritizing continuation", () => {
		const recommendations = deriveQuestHallDemoRecommendations(applyQuestHallDemoScenario(makeData(), "mixed"));
		expect(recommendations).toHaveLength(2);
		expect(recommendations[0]).toMatchObject({ key: "daily-3", status: "in-progress" });
		expect(recommendations[1].section).toBe("weekly");
		expect(recommendations.every((item) => item.status !== "completed")).toBe(true);
	});

	it("surfaces unread feedback ahead of unfinished recommendations", () => {
		const recommendations = deriveQuestHallDemoRecommendations(applyQuestHallDemoScenario(makeData(), "feedback-unread"));
		expect(recommendations[0]).toMatchObject({ key: "daily-1", status: "completed", hasUnread: true });
		expect(recommendations[1]).toMatchObject({ section: "weekly", status: "not-started" });
	});

	it("keeps two simultaneous continuations ahead of new tasks", () => {
		const data = makeData();
		data.dailyTasks[0] = makeQuest(1, "in_progress");
		data.dailyTasks[1] = makeQuest(2, "in_progress");
		expect(deriveQuestHallDemoRecommendations(data).map((item) => item.key)).toEqual(["daily-1", "daily-2"]);
	});

	it("lays out the bureau book as 1+2 tasks, then 2+2 tasks", () => {
		const data = makeData();
		data.dailyTasks.push(makeQuest(5), makeQuest(6), makeQuest(7));
		const spreads = deriveQuestHallDemoBookSpreads(data, "daily");
		expect(
			spreads.map((spread) => ({
				left: spread.leftItems.map((item) => item.key),
				right: spread.rightItems.map((item) => item.key),
			})),
		).toEqual([
			{ left: ["daily-1"], right: ["daily-2", "daily-3"] },
			{ left: ["daily-4", "daily-5"], right: ["daily-6", "daily-7"] },
		]);

		data.dailyTasks = data.dailyTasks.slice(0, 5);
		const second = deriveQuestHallDemoBookSpreads(data, "daily")[1];
		expect(second.leftItems.map((item) => item.key)).toEqual(["daily-4", "daily-5"]);
		expect(second.rightItems).toEqual([]);
	});

	it("keeps book turns continuous across section boundaries", () => {
		const data = makeData();
		data.dailyTasks.push(makeQuest(5));
		expect(getQuestHallDemoCatalogTurnTarget(data, "daily", 2, 1)).toEqual({ section: "weekly", leaf: 1 });
		expect(getQuestHallDemoCatalogTurnTarget(data, "weekly", 1, -1)).toEqual({ section: "daily", leaf: 2 });
		expect(getQuestHallDemoCatalogTurnTarget(data, "daily", 1, -1)).toBeNull();
		expect(getQuestHallDemoCatalogTurnTarget(data, "translation", 1, 1)).toBeNull();
	});

	it("numbers every section within one shared CARTE pagination", () => {
		const data = makeData();
		expect(getQuestHallDemoCatalogPagePosition(data, "daily", 1)).toEqual({ current: 1, total: 4 });
		expect(getQuestHallDemoCatalogPagePosition(data, "daily", 2)).toEqual({ current: 2, total: 4 });
		expect(getQuestHallDemoCatalogPagePosition(data, "weekly", 1)).toEqual({ current: 3, total: 4 });
		expect(getQuestHallDemoCatalogPagePosition(data, "translation", 1)).toEqual({ current: 4, total: 4 });

		data.dailyTasks = [];
		data.weeklyTasks = [];
		data.translationTasks = [];
		expect(getQuestHallDemoCatalogPagePosition(data, "daily", 1)).toEqual({ current: 1, total: 3 });
		expect(getQuestHallDemoCatalogPagePosition(data, "weekly", 1)).toEqual({ current: 2, total: 3 });
		expect(getQuestHallDemoCatalogPagePosition(data, "translation", 1)).toEqual({ current: 3, total: 3 });

		const populated = makeData();
		expect(getQuestHallDemoCatalogPagePosition(populated, "daily", 99)).toEqual({ current: 2, total: 4 });
	});
});

describe("Quest Hall demo reducer", () => {
	it("uses push for hierarchy entry and infers section from a selected task", () => {
		const opened = reduceQuestHallDemoState({ ...DEFAULT_QUEST_HALL_DEMO_URL_STATE }, { type: "open-catalog", section: "weekly" });
		expect(opened).toMatchObject({ state: { view: "catalog", section: "weekly", leaf: 1 }, historyIntent: "push" });
		const selected = reduceQuestHallDemoState(opened.state, { type: "select-task", task: "translation-22" });
		expect(selected).toMatchObject({ state: { view: "prepare", section: "translation", task: "translation-22" }, historyIntent: "push" });
	});

	it("uses replace for in-catalog and demo-control changes", () => {
		const catalog = { ...DEFAULT_QUEST_HALL_DEMO_URL_STATE, view: "catalog" as const };
		expect(reduceQuestHallDemoState(catalog, { type: "switch-section", section: "weekly" })).toMatchObject({
			state: { section: "weekly", leaf: 1 },
			historyIntent: "replace",
		});
		expect(reduceQuestHallDemoState(catalog, { type: "switch-section", section: "weekly", leaf: 2 })).toMatchObject({
			state: { section: "weekly", leaf: 2 },
			historyIntent: "replace",
		});
		expect(reduceQuestHallDemoState(catalog, { type: "turn-leaf", leaf: 2 })).toMatchObject({ state: { leaf: 2 }, historyIntent: "replace" });
		expect(reduceQuestHallDemoState(catalog, { type: "set-motion", motion: "reduce" }).historyIntent).toBe("replace");
	});

	it("requests browser back when leaving a hierarchy level", () => {
		const prepare = normalizeQuestHallDemoUrlState({ view: "prepare", task: "daily-3" });
		expect(reduceQuestHallDemoState(prepare, { type: "return-from-prepare" })).toMatchObject({
			state: { view: "catalog", task: null },
			historyIntent: "back",
		});
		expect(reduceQuestHallDemoState(prepare, { type: "return-from-prepare", destination: "home" })).toMatchObject({
			state: { view: "home", task: null },
			historyIntent: "back",
		});
	});

	it("returns none and the same reference for no-op events", () => {
		const state = { ...DEFAULT_QUEST_HALL_DEMO_URL_STATE };
		const transition = reduceQuestHallDemoState(state, { type: "set-motion", motion: "system" });
		expect(transition).toEqual({ state, historyIntent: "none" });
		expect(transition.state).toBe(state);
	});
});

describe("legacy Quest Hall demo state compatibility", () => {
	it("falls back to actual for unknown values", () => {
		expect(parseQuestHallDemoState("unknown")).toBe("actual");
	});

	it("preserves current data in actual and keeps the third-task fixture", () => {
		const tasks = [makeQuest(1), makeQuest(2), makeQuest(3)];
		expect(applyQuestHallDemoState({ dailyTasks: tasks }, "actual").dailyTasks).toBe(tasks);
		expect(applyQuestHallDemoState({ dailyTasks: tasks }, "third-in-progress").dailyTasks.map((task) => task.sessionStatus)).toEqual([
			"completed",
			null,
			"in_progress",
		]);
	});
});
