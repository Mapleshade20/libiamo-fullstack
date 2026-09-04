import { describe, expect, it } from "vitest";
import type { HallQuest } from "$lib/quest-hall";
import { adaptHallDataToQuestMenu } from "$lib/quest-hall/menu";
import { DEFAULT_HALL_LOCATION, hallLocationUrl, normalizeHallLocation, parseHallLocation, reduceHallLocation } from "$lib/quest-hall/navigation";
import type { HallData } from "$lib/server/quest-hall";

function quest(id: number): HallQuest {
	return {
		id,
		title: `Task ${id}`,
		shortObjective: null,
		templateUi: "imessage",
		templateDifficulty: 1,
		templateInteractionType: "chat",
		pointReward: 5,
		sessionStatus: null,
		unreadCount: 0,
		hasUnreadReply: false,
	};
}

const data: HallData = {
	activeLanguage: "en",
	nativeLanguage: "fr",
	localDate: "2026-09-04",
	localMonday: "2026-08-31",
	editionDate: "2026-09-04",
	translationMonth: "2026-09",
	greeting: "Welcome",
	subtitle: "Choose",
	dailyTasks: [quest(1), quest(2), quest(3), quest(4)],
	weeklyTasks: [quest(11)],
	translationTasks: [],
	translationStatusMap: {},
};
const catalog = adaptHallDataToQuestMenu(data);

describe("production Hall navigation", () => {
	it("uses deterministic defaults and accepts full URLs", () => {
		expect(parseHallLocation("")).toEqual(DEFAULT_HALL_LOCATION);
		expect(parseHallLocation("https://example.test/?view=catalog&section=weekly&leaf=2")).toEqual({
			view: "catalog",
			section: "weekly",
			leaf: 2,
			task: null,
		});
	});

	it("normalizes malformed values and clamps catalog leaves", () => {
		expect(parseHallLocation("?view=broken&section=other&leaf=-8&task=nope", catalog)).toEqual(DEFAULT_HALL_LOCATION);
		expect(parseHallLocation("?view=prepare&task=nope", catalog)).toMatchObject({ view: "catalog", task: null });
		expect(parseHallLocation("?view=catalog&section=daily&leaf=99", catalog)).toMatchObject({ section: "daily", leaf: 2 });
		expect(normalizeHallLocation({ view: "prepare", task: "translation-21" })).toMatchObject({
			view: "prepare",
			section: "translation",
			task: "translation-21",
		});
	});

	it("serializes base-aware canonical Hall URLs", () => {
		expect(hallLocationUrl({ ...DEFAULT_HALL_LOCATION }, "")).toBe("/");
		expect(hallLocationUrl({ view: "catalog", section: "weekly", leaf: 2, task: null }, "/libiamo")).toBe(
			"/libiamo/?view=catalog&section=weekly&leaf=2",
		);
	});

	it("uses push for hierarchy entry, replace for browsing, and back for closing", () => {
		const opened = reduceHallLocation({ ...DEFAULT_HALL_LOCATION }, { type: "open-catalog", section: "weekly" }, catalog);
		expect(opened).toEqual({
			location: { view: "catalog", section: "weekly", leaf: 1, task: null },
			historyIntent: "push",
		});
		expect(reduceHallLocation(opened.location, { type: "turn-leaf", section: "daily", leaf: 2 }, catalog)).toMatchObject({
			location: { view: "catalog", section: "daily", leaf: 2 },
			historyIntent: "replace",
		});
		expect(reduceHallLocation(opened.location, { type: "close-catalog" }, catalog)).toMatchObject({
			location: { view: "home", task: null },
			historyIntent: "back",
		});
	});

	it("infers the preparation section and returns none for a no-op", () => {
		const selected = reduceHallLocation({ ...DEFAULT_HALL_LOCATION }, { type: "select-item", task: "weekly-11" }, catalog);
		expect(selected).toMatchObject({ location: { view: "prepare", section: "weekly", task: "weekly-11" }, historyIntent: "push" });
		const unchanged = reduceHallLocation({ ...DEFAULT_HALL_LOCATION }, { type: "close-catalog" }, catalog);
		expect(unchanged.historyIntent).toBe("none");
	});
});
