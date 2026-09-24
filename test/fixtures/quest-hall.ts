import type { HallQuest } from "$lib/quest-hall";
import type { HallData } from "$lib/server/quest-hall";
export function quest(id: number, overrides: Partial<HallQuest> = {}): HallQuest {
	return {
		id,
		lineupId: 1,
		title: `Quest ${id}`,
		shortObjective: `Objective ${id}`,
		ui: "imessage",
		difficulty: 2,
		sessionStatus: null,
		evaluationPhase: null,
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
			{ id: 21, title: "Current letter", description: "Translate a short letter.", difficulty: 1, createdMonth: "2026-09" },
			{ id: 22, title: "Archived letter", description: null, difficulty: 2, createdMonth: "2026-08" },
		],
		translationStatusMap: {},
		...overrides,
	};
}
