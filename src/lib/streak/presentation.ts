import type { StreakDayMark } from "$lib/streak/history";
import type { StreakView } from "$lib/streak/rules";
import { addDays } from "$lib/time/local-day";
export type FlameAppearance = "gray" | "kindling" | "burn";
export type CelebrationKind = "kindling" | "ignite";
export type ProgressReceipt = { day: string; progress: number };
export type PresentationReceipt = ProgressReceipt & { pending: CelebrationKind | null; reviewCleared?: boolean };

export function parsePresentationReceipt(raw: string | null): PresentationReceipt | null {
	try {
		const value = JSON.parse(raw ?? "null");
		if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || ![0, 1, 2].includes(value.progress)) return null;
		return {
			day: value.day,
			progress: value.progress,
			pending: ["kindling", "ignite"].includes(value.pending) ? value.pending : null,
			...(typeof value.reviewCleared === "boolean" ? { reviewCleared: value.reviewCleared } : {}),
		};
	} catch {
		return null;
	}
}

export function advancePresentationReceipt(
	previous: PresentationReceipt | null,
	view: StreakView,
	day: string,
	passiveReview = false,
): PresentationReceipt {
	const sameDay = previous?.day === day;
	// Silence only the newly observed review gate, never a concurrent quest or an existing reward.
	const silentIncrement = passiveReview && view.reviewCleared && sameDay && (previous.reviewCleared === false || previous.progress === 0) ? 1 : 0;
	const comparison = previous ? { ...previous, progress: previous.progress + silentIncrement } : null;
	const pending = completionChange(comparison, view, day) ?? (sameDay ? previous.pending : null);
	return {
		day,
		progress: Math.max(progressOf(view), sameDay ? previous.progress : 0),
		reviewCleared: view.reviewCleared || (sameDay && previous.reviewCleared === true),
		pending: pending && progressOf(view) === 2 ? "ignite" : pending,
	};
}
export function progressOf(view: StreakView): number {
	return Number(view.taskCount > 0) + Number(view.reviewCleared);
}
export function flameAppearance(view: StreakView): FlameAppearance {
	return view.status === "lit" ? "burn" : progressOf(view) > 0 ? "kindling" : "gray";
}
// First visits and day rollover establish a baseline, never an entrance celebration.
export function completionChange(previous: ProgressReceipt | null, view: StreakView, day: string): CelebrationKind | null {
	const progress = progressOf(view);
	if (!previous || previous.day !== day || progress <= previous.progress) return null;
	return progress === 2 ? "ignite" : "kindling";
}
/** History survives breaks. Only today's outcome may be supplied by the live aggregate. */
export function streakWeek(view: StreakView, today: string, marks: StreakDayMark[] = []) {
	const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
	const monday = addDays(today, -((weekday + 6) % 7));
	const states = new Map(marks.map((mark) => [mark.day, mark.state]));
	if (view.status === "lit") states.set(today, "lit");
	return Array.from({ length: 7 }, (_, index) => {
		const day = addDays(monday, index);
		const state = day <= today ? states.get(day) : undefined;
		return { day, today: day === today, future: day > today, continued: Boolean(state), state };
	});
}
