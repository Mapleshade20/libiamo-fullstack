import { dayKey, sandboxed, tourWeek } from "#lib/components/tour/sandbox.svelte.ts";
import type { DayKind, HistoryWeek, WeekView } from "./types.ts";
import { history, week } from "./week.remote.ts";

/** This week as the glasses read it: the learner's own, or the tour's from its sandbox while it plays. */
export function weekNow(): WeekView | Promise<WeekView> {
	return sandboxed() ? tourWeek() : week();
}

/** The weeks up to this one, oldest first (the profile): the learner's own, or in the tour's sandbox only this week. */
export function historyNow(weeks: number): HistoryWeek[] | Promise<HistoryWeek[]> {
	if (!sandboxed()) return history(weeks);
	const now = tourWeek();
	const start = (i: number) => {
		const d = new Date(`${now.days[0].day}T00:00:00`);
		d.setDate(d.getDate() - 7 * (weeks - 1 - i));
		return dayKey(d);
	};
	return Array.from({ length: weeks }, (_, i) => ({
		start: start(i),
		goal: now.goal,
		days: i === weeks - 1 ? now.days.map((d) => d.kind) : Array<DayKind>(7).fill("none"),
	}));
}
