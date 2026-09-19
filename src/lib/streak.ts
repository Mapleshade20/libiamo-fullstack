/**
 * Streak rules, as pure functions.
 *
 * `today` is always an argument: nothing here reads a clock, a cookie, or module-level state, which
 * is what lets the server, the client, the tests, and the dev harness's virtual dates all use these
 * functions without disagreeing about what day it is. The dev day offset is applied by the callers
 * that resolve `today`, never here.
 */

import { addDays, dayDelta, localDay, maxDay } from "$lib/local-day";

export { dayDelta, localDay };

export const STREAK_BANK_MAX = 3;

/** Cumulative quests in one day that earn the first, second and third saved day. */
const SAVED_DAY_THRESHOLDS = [3, 6, 10] as const;

export type StreakRecord = {
	streakDays: number;
	/** Last day counted into `streakDays`, lit or covered by a saved day. Null exactly at 0 days. */
	throughDate: string | null;
	bank: number;
	/** The local day the three counters below describe; null when they describe nothing. */
	progressDate: string | null;
	taskCount: number;
	reviewCleared: boolean;
	bankEarnedToday: number;
};

export type StreakStatus = "lit" | "pending" | "none";

export type StreakView = {
	days: number;
	bank: number;
	status: StreakStatus;
	taskCount: number;
	reviewCleared: boolean;
	/** Null when the badge is full or today can earn nothing more. */
	questsToNextSavedDay: number | null;
	/** Above zero right after an absence the badge covered. */
	savedDaysSpent: number;
};

export type StreakEvent =
	| { kind: "lit"; days: number; bank: number }
	| { kind: "saved-day-earned"; bank: number }
	| { kind: "saved-day-spent"; days: number; spent: number }
	| { kind: "broken"; previousDays: number };

/** The last view a device acknowledged, persisted so a full page reload still animates. */
export type AcknowledgedStreak = { day: string; days: number; bank: number; status: StreakStatus };

export function acknowledgedStreak(view: StreakView, day: string): AcknowledgedStreak {
	return { day, days: view.days, bank: view.bank, status: view.status };
}

/**
 * What changed since this device last acknowledged the streak.
 *
 * Diffing against a stored value rather than against the previous render is what makes the flagship
 * path work: finishing a session is a full page reload, so the indicator mounts with no previous
 * value of its own. It also dedupes the break and spend notifications, which are derived state that
 * persists until the next write materialises settlement.
 */
export function streakTransitions(previous: AcknowledgedStreak | null, view: StreakView, day: string): StreakEvent[] {
	if (!previous) return [];
	const events: StreakEvent[] = [];
	if (previous.days > 0 && view.days === 0) events.push({ kind: "broken", previousDays: previous.days });
	if (view.savedDaysSpent > 0 && view.days > previous.days) events.push({ kind: "saved-day-spent", days: view.days, spent: view.savedDaysSpent });
	if (view.status === "lit" && (previous.status !== "lit" || previous.day !== day)) events.push({ kind: "lit", days: view.days, bank: view.bank });
	if (view.bank > previous.bank) events.push({ kind: "saved-day-earned", bank: view.bank });
	return events;
}

export function emptyStreakRecord(): StreakRecord {
	return { streakDays: 0, throughDate: null, bank: 0, progressDate: null, taskCount: 0, reviewCleared: false, bankEarnedToday: 0 };
}

export function streakRecordsEqual(a: StreakRecord, b: StreakRecord): boolean {
	return (
		a.streakDays === b.streakDays &&
		a.throughDate === b.throughDate &&
		a.bank === b.bank &&
		a.progressDate === b.progressDate &&
		a.taskCount === b.taskCount &&
		a.reviewCleared === b.reviewCleared &&
		a.bankEarnedToday === b.bankEarnedToday
	);
}

/** Saved days earned by a day's cumulative quest count, already capped at `STREAK_BANK_MAX`. */
export function savedDaysFor(taskCount: number): number {
	let earned = 0;
	for (const threshold of SAVED_DAY_THRESHOLDS) {
		if (taskCount >= threshold) earned++;
	}
	return Math.min(earned, STREAK_BANK_MAX);
}

function questsToNextSavedDay(bank: number, taskCount: number): number | null {
	if (bank >= STREAK_BANK_MAX) return null;
	const next = SAVED_DAY_THRESHOLDS.find((threshold) => threshold > taskCount);
	return next === undefined ? null : next - taskCount;
}

/**
 * The day arithmetic runs on, clamped to be monotonic. The timezone cookie is learner-controlled,
 * so a backwards jump must not re-open a day that has already been counted. Both stored dates
 * matter: a covered day advances `throughDate` while `progressDate` can sit further back.
 */
export function effectiveToday(record: StreakRecord | null, today: string): string {
	if (!record) return today;
	let day = today;
	if (record.throughDate) day = maxDay(day, record.throughDate);
	if (record.progressDate) day = maxDay(day, record.progressDate);
	return day;
}

/** Saved days carried in from earlier days. Today's own earnings are never spent by today. */
function carriedBank(record: StreakRecord, today: string): number {
	const earnedToday = record.progressDate === today ? Math.min(record.bankEarnedToday, record.bank) : 0;
	return Math.max(0, record.bank - earnedToday);
}

/** Days that have fully elapsed without being counted. Today is never settled while it is running. */
function missedDays(record: StreakRecord, today: string): number {
	if (!record.throughDate) return 0;
	return Math.max(0, dayDelta(record.throughDate, today) - 1);
}

export function settle(record: StreakRecord, today: string): { days: number; bank: number; spent: number; broken: boolean } {
	const missed = missedDays(record, today);
	if (missed === 0) return { days: record.streakDays, bank: record.bank, spent: 0, broken: false };
	const carried = carriedBank(record, today);
	if (missed <= carried) return { days: record.streakDays + missed, bank: record.bank - missed, spent: missed, broken: false };
	return { days: 0, bank: record.bank - carried, spent: 0, broken: true };
}

/**
 * Settlement materialised onto the row. `throughDate` moves to the last day counted — lit or
 * covered — so re-running `settle` on the result is a no-op and derivation agrees with storage.
 */
export function settleRecord(record: StreakRecord, today: string): StreakRecord {
	const settled = settle(record, today);
	if (settled.spent === 0 && !settled.broken) return record;
	return normalize({
		...record,
		streakDays: settled.days,
		throughDate: settled.broken ? null : addDays(today, -1),
		bank: settled.bank,
	});
}

/** Counters that describe nothing carry no date, so "no progress today" has one representation. */
function normalize(record: StreakRecord): StreakRecord {
	if (record.taskCount === 0 && !record.reviewCleared && record.bankEarnedToday === 0 && record.progressDate !== null) {
		return { ...record, progressDate: null };
	}
	return record;
}

/** Today's counters, reset when the stored ones describe an earlier day. */
function counterFor(record: StreakRecord, today: string) {
	if (record.progressDate === today) {
		return { taskCount: record.taskCount, reviewCleared: record.reviewCleared, bankEarnedToday: record.bankEarnedToday };
	}
	return { taskCount: 0, reviewCleared: false, bankEarnedToday: 0 };
}

export function viewStreak(record: StreakRecord | null, today: string): StreakView {
	const source = record ?? emptyStreakRecord();
	const day = effectiveToday(source, today);
	const settled = settle(source, day);
	const counters = counterFor(source, day);
	const status: StreakStatus = source.throughDate === day ? "lit" : settled.days > 0 ? "pending" : "none";
	return {
		days: settled.days,
		bank: settled.bank,
		status,
		taskCount: counters.taskCount,
		reviewCleared: counters.reviewCleared,
		questsToNextSavedDay: questsToNextSavedDay(settled.bank, counters.taskCount),
		savedDaysSpent: settled.spent,
	};
}

/**
 * Both transitions share three steps: settle the carried streak through yesterday, update today's
 * counters, then light the day when both conditions hold.
 */
type DayCounters = ReturnType<typeof counterFor>;

function advance(record: StreakRecord | null, today: string, update: (counters: DayCounters, bank: number) => DayCounters): StreakRecord {
	const source = record ?? emptyStreakRecord();
	const day = effectiveToday(source, today);
	const settled = settleRecord(source, day);
	const before = counterFor(settled, day);
	const counters = update(before, settled.bank);
	const bank = settled.bank + (counters.bankEarnedToday - before.bankEarnedToday);

	let { streakDays, throughDate } = settled;
	if (counters.taskCount >= 1 && counters.reviewCleared && throughDate !== day) {
		streakDays += 1;
		throughDate = day;
	}
	return normalize({ ...settled, streakDays, throughDate, bank, progressDate: day, ...counters });
}

export function applyQuestCompletion(record: StreakRecord | null, today: string, reviewQueueEmpty: boolean): StreakRecord {
	return advance(record, today, (counters, bank) => {
		const taskCount = counters.taskCount + 1;
		// A delta against what today already granted, so repeat completions grant exactly once.
		const granted = Math.max(0, Math.min(savedDaysFor(taskCount) - counters.bankEarnedToday, STREAK_BANK_MAX - bank));
		return {
			taskCount,
			reviewCleared: counters.reviewCleared || reviewQueueEmpty,
			bankEarnedToday: counters.bankEarnedToday + granted,
		};
	});
}

export function applyReviewObservation(record: StreakRecord | null, today: string, queueEmpty: boolean): StreakRecord {
	// Never `=`: the gate is a positive observation, so cards falling due later in the day cannot
	// darken a day that was already lit.
	return advance(record, today, (counters) => ({ ...counters, reviewCleared: counters.reviewCleared || queueEmpty }));
}
