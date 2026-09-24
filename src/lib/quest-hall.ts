import type { PracticeEvaluationPhase, UiVariant } from "$lib/constants";

export type HallQuestSessionStatus = "in_progress" | "completed" | "evaluated" | "abandoned" | null;

/** One practice task as it stands in a lineup, with the learner's progress in that lineup. */
export interface HallQuest {
	id: number;
	lineupId: number;
	title: string;
	shortObjective: string | null;
	ui: UiVariant;
	difficulty: number;
	sessionStatus: HallQuestSessionStatus;
	/** Progress through the evaluation page once the conversation has ended. */
	evaluationPhase: PracticeEvaluationPhase | null;
	unreadCount: number | null;
	hasUnreadReply: boolean;
}

/** The conversation is over; the evaluation page may still be in progress. */
export function isHallQuestConversationEnded(status: HallQuestSessionStatus): boolean {
	return status === "completed" || status === "evaluated";
}

/** Finished means the whole evaluation page is done, matching translation's `completed` phase. */
export function isHallQuestFinished(quest: Pick<HallQuest, "sessionStatus" | "evaluationPhase">): boolean {
	return isHallQuestConversationEnded(quest.sessionStatus) && quest.evaluationPhase === "completed";
}
