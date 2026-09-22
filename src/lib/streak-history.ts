import { addDays } from "$lib/local-day";
import { effectiveToday, type StreakRecord, settle } from "$lib/streak";

/** The value set of `streak_day.state`. `schema.ts` derives both the column type and its check
 * constraint from this list, so the two cannot drift apart silently. */
export const STREAK_DAY_STATES = ["lit", "covered"] as const;
export type StreakDayState = (typeof STREAK_DAY_STATES)[number];

export type StreakDayMark = { day: string; state: StreakDayState };
export type StreakCalendarData = { days: StreakDayMark[]; since: string | null };

export function validMonth(value: string): boolean {
	return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= "1900-01" && value <= "9998-12";
}

export function monthOffset(month: string, offset: number): string {
	const date = new Date(`${month}-01T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + offset);
	return date.toISOString().slice(0, 7);
}

/** Fixed six-week Monday-first window. Never uses the host's timezone. */
export function monthRange(month: string) {
	const first = `${month}-01`;
	const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
	const from = addDays(first, -((weekday + 6) % 7));
	return { from, to: addDays(from, 41) };
}

/** At most three protected dates; follows the existing all-or-break bank rule exactly. */
export function coveredDays(record: StreakRecord | null, today: string): StreakDayMark[] {
	if (!record?.throughDate) return [];
	const through = record.throughDate;
	const { spent } = settle(record, effectiveToday(record, today));
	return Array.from({ length: spent }, (_, index) => ({ day: addDays(through, index + 1), state: "covered" }));
}

/** Written under the aggregate row lock, in the same transaction/savepoint. */
export function historyChanges(before: StreakRecord, after: StreakRecord, today: string): StreakDayMark[] {
	const day = effectiveToday(before, today);
	const marks = coveredDays(before, day);
	if (after.throughDate === day && after.taskCount > 0 && after.reviewCleared) marks.push({ day, state: "lit" });
	return marks;
}

/** Lazy settlement is projected on reads, without persisting or erasing earlier runs. */
export function calendarDays(stored: StreakDayMark[], record: StreakRecord | null, today: string, from: string, to: string): StreakDayMark[] {
	const marks = new Map(stored.map((mark) => [mark.day, mark]));
	for (const mark of coveredDays(record, today)) if (!marks.has(mark.day)) marks.set(mark.day, mark);
	return [...marks.values()].filter((mark) => mark.day >= from && mark.day <= to && mark.day <= today).sort((a, b) => a.day.localeCompare(b.day));
}
