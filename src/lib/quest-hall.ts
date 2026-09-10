export type HallQuestSessionStatus = "in_progress" | "completed" | "evaluated" | "abandoned" | null;

export interface HallQuest {
	id: number;
	title: string;
	shortObjective: string | null;
	templateUi: string;
	templateDifficulty: number;
	templateInteractionType: string;
	pointReward: number;
	sessionStatus: HallQuestSessionStatus;
	unreadCount: number | null;
	hasUnreadReply: boolean;
}

export function isHallQuestFinished(status: HallQuestSessionStatus): boolean {
	return status === "completed" || status === "evaluated";
}
