import type { HallQuest } from "$lib/quest-hall";
import type { HallData } from "$lib/server/quest-hall";
export function quest(id: number, overrides: Partial<HallQuest> = {}): HallQuest {
	return {
		id,
		title: `Quest ${id}`,
		shortObjective: `Objective ${id}`,
		templateUi: "imessage",
		templateDifficulty: 2,
		templateInteractionType: "chat",
		pointReward: 10,
		sessionStatus: null,
		unreadCount: 0,
		hasUnreadReply: false,
		...overrides,
	};
}

export function hallData(overrides: Partial<HallData> = {}): HallData {
	return {
		activeLanguage: "en",
		nativeLanguage: "fr",
		levelSelfAssign: 2,
		localDate: "2026-09-04",
		localMonday: "2026-08-31",
		editionDate: "2026-09-04",
		translationMonth: "2026-09",
		greeting: "Good morning, Fedor",
		subtitle: "A few thoughtful missions are waiting.",
		dailyTasks: [quest(1, { unreadCount: 2, hasUnreadReply: true })],
		weeklyTasks: [quest(11)],
		translationTasks: [
			{ id: 21, titleBase: "Current letter", descriptionBase: "Translate a short letter.", difficulty: 1, createdMonth: "2026-09" },
			{ id: 22, titleBase: "Archived letter", descriptionBase: null, difficulty: 2, createdMonth: "2026-08" },
		],
		translationStatusMap: {},
		...overrides,
	};
}
