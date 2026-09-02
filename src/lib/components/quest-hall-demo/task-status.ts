import type { HallQuestSessionStatus } from "$lib/quest-hall";

export type CarteTaskVisualState = "ready" | "active" | "resume" | "done";

export const CARTE_TASK_STATUS_LABELS: Record<CarteTaskVisualState, string> = {
	ready: "À commencer",
	active: "En cours",
	resume: "À reprendre",
	done: "Terminé",
};

export function getCarteTaskVisualState(status: HallQuestSessionStatus): CarteTaskVisualState {
	if (status === "in_progress") return "active";
	if (status === "abandoned") return "resume";
	if (status === "completed" || status === "evaluated") return "done";
	return "ready";
}

export function getCarteTaskStatusLabel(status: HallQuestSessionStatus): string {
	return CARTE_TASK_STATUS_LABELS[getCarteTaskVisualState(status)];
}
