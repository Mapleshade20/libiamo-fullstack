import { writable } from "svelte/store";

export interface TransitionRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

export interface TaskEnterTransition {
	taskId: number;
	href: string;
	sourceRect: TransitionRect;
	sourceRadius: number;
	stage: "captured" | "animating";
}

export const taskEnterTransition = writable<TaskEnterTransition | null>(null);

export function captureTaskEnterTransition(transition: Omit<TaskEnterTransition, "stage">) {
	taskEnterTransition.set({ ...transition, stage: "captured" });
}

export function markTaskEnterAnimating() {
	taskEnterTransition.update((transition) => {
		if (!transition) return null;
		return { ...transition, stage: "animating" };
	});
}

export function clearTaskEnterTransition() {
	taskEnterTransition.set(null);
}
