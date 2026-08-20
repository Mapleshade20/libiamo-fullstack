import { describe, expect, it } from "vitest";
import { formatHallEditionDate, getHallQuestAction, getInitialHallQuestId, type HallQuest } from "$lib/quest-hall";

function quest(overrides: Partial<HallQuest> = {}): HallQuest {
	return {
		id: 1,
		title: "A quest",
		shortObjective: "Complete the scenario.",
		templateUi: "imessage",
		templateDifficulty: 2,
		templateInteractionType: "chat",
		pointReward: 20,
		sessionStatus: null,
		unreadCount: null,
		hasUnreadReply: false,
		...overrides,
	};
}

describe("quest hall task decisions", () => {
	it("formats the server-provided local date in the fixed edition format", () => {
		expect(formatHallEditionDate("2026-07-30")).toBe("2026.07.30");
		expect(formatHallEditionDate("not-a-date")).toBe("not-a-date");
	});

	it("recommends an in-progress quest before a new or completed quest", () => {
		expect(
			getInitialHallQuestId([quest({ id: 1, sessionStatus: "completed" }), quest({ id: 2 }), quest({ id: 3, sessionStatus: "in_progress" })]),
		).toBe(3);
	});

	it("falls back to the first unfinished quest and then the first quest", () => {
		expect(getInitialHallQuestId([quest({ id: 1, sessionStatus: "evaluated" }), quest({ id: 2 })])).toBe(2);
		expect(getInitialHallQuestId([quest({ id: 4, sessionStatus: "completed" })])).toBe(4);
		expect(getInitialHallQuestId([])).toBeNull();
	});

	it("links ordinary quests directly to the next meaningful step", () => {
		expect(getHallQuestAction(quest({ id: 7 }))).toEqual({ href: "/task/7/session", labelKey: "task.startPractice" });
		expect(getHallQuestAction(quest({ id: 7, sessionStatus: "in_progress" }))).toEqual({
			href: "/task/7/session",
			labelKey: "hall.continue",
		});
		expect(getHallQuestAction(quest({ id: 7, sessionStatus: "evaluated" }))).toEqual({
			href: "/task/7/feedback",
			labelKey: "hall.reviewReport",
		});
	});

	it("keeps unsupported practice UIs on the full brief", () => {
		expect(getHallQuestAction(quest({ id: 9, templateUi: "future_ui" }))).toEqual({
			href: "/task/9",
			labelKey: "hall.enter",
		});
	});
});
