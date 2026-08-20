import { isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";

export type HallQuestSessionStatus = "in_progress" | "completed" | "evaluated" | null;

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

export function getInitialHallQuestId(tasks: HallQuest[]): number | null {
	return (
		tasks.find((task) => task.sessionStatus === "in_progress")?.id ??
		tasks.find((task) => !isHallQuestFinished(task.sessionStatus))?.id ??
		tasks[0]?.id ??
		null
	);
}

export function getHallQuestAction(task: HallQuest): { href: string; labelKey: string } {
	if (isHallQuestFinished(task.sessionStatus)) {
		return { href: `/task/${task.id}/feedback`, labelKey: "hall.reviewReport" };
	}

	if (isPracticeUiImplemented(task.templateUi)) {
		return {
			href: `/task/${task.id}/session`,
			labelKey: task.sessionStatus === "in_progress" ? "hall.continue" : "task.startPractice",
		};
	}

	return { href: `/task/${task.id}`, labelKey: "hall.enter" };
}

export function formatHallEditionDate(dateString: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
	if (!match) return dateString;

	return `${match[1]}.${match[2]}.${match[3]}`;
}
