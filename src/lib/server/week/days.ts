import { and, between, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { note, practiceDay, user, userWeek } from "#lib/server/db/schema.ts";
import { LEARN_AHEAD_MS } from "#lib/server/review/scheduler.ts";
import { addDays, localDay, weekStartOf } from "#lib/time/local-day.ts";
import type { DayKind, HistoryWeek, WeekView } from "#lib/week/types.ts";

/*
 * The learner's week (design §5.2): a day counts when both halves are set, learning something (a piece finished, one
 * written again) and clearing the reviews (a rating that leaves the queue empty, or a visit that finds it empty with something in the notebook). Each
 * half is written only in the transaction that earned it, by an upsert that keeps the first time: never a
 * read-modify-write. Days are the learner's, in their time zone; weeks start on Monday and keep the aim they were held
 * to. The queue that counts is the one of the language the learner is working in: the one they see.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Writer = typeof db | Tx;
export type WeekLearner = { id: string; timeZone?: string | null; weeklyGoal?: number | null };

export const zoneOf = (u: { timeZone?: string | null }) => u.timeZone || "UTC";

/** Whether the learner has nothing to review in a language right now (learning cards count from learn ahead on). */
export async function queueEmpty(w: Writer, userId: string, language: string, at = new Date()): Promise<boolean> {
	const ahead = new Date(at.getTime() + LEARN_AHEAD_MS);
	const rows = await w
		.select({ one: sql<number>`1` })
		.from(note)
		.where(
			and(
				eq(note.userId, userId),
				eq(note.language, language),
				isNull(note.deletedAt),
				or(lte(note.due, at), and(lte(note.due, ahead), sql`${note.fsrs}->>'state' in ('1', '3')`)),
			),
		)
		.limit(1);
	return rows.length === 0;
}

/**
 * Whether a visit finds the reviews done: there are notes in the language, and none is waiting. A learner with nothing
 * in their notebook yet has reviewed nothing, so a visit earns them no half (their glass stays empty until they learn).
 */
export async function reviewsDone(w: Writer, userId: string, language: string, at = new Date()): Promise<boolean> {
	const [any] = await w
		.select({ one: sql<number>`1` })
		.from(note)
		.where(and(eq(note.userId, userId), eq(note.language, language), isNull(note.deletedAt)))
		.limit(1);
	return !!any && (await queueEmpty(w, userId, language, at));
}

/**
 * Credits today with a half. Learning something on a day with nothing to review is the whole day: the reviews are as
 * done as they can be. Returns whether the day changed.
 */
export async function credit(w: Writer, u: WeekLearner, half: "learned" | "reviewed", language: string, at = new Date()): Promise<boolean> {
	const tz = zoneOf(u);
	const day = localDay(at, tz);
	const both = half === "reviewed" || (await queueEmpty(w, u.id, language, at));
	const set = { learnedAt: half === "learned" ? at : null, reviewedAt: both ? at : null };
	const [row] = await w
		.insert(practiceDay)
		.values({ userId: u.id, day, ...set })
		.onConflictDoUpdate({
			target: [practiceDay.userId, practiceDay.day],
			set: {
				learnedAt: sql`coalesce(${practiceDay.learnedAt}, excluded.learned_at)`,
				reviewedAt: sql`coalesce(${practiceDay.reviewedAt}, excluded.reviewed_at)`,
			},
			// Only when it earns a half the day does not have yet: nothing is rewritten for a half already earned.
			setWhere: sql`(${practiceDay.learnedAt} is null and excluded.learned_at is not null) or (${practiceDay.reviewedAt} is null and excluded.reviewed_at is not null)`,
		})
		.returning({ learnedAt: practiceDay.learnedAt, reviewedAt: practiceDay.reviewedAt });
	await holdWeek(w, u, weekStartOf(day));
	if (!row) return false;
	const mine = (t: Date | null, mark: Date | null) => !!mark && t?.getTime() === mark.getTime();
	return mine(row.learnedAt, set.learnedAt) || mine(row.reviewedAt, set.reviewedAt);
}

/** The week's aim as it stands when the week is first written to; a later change of goal moves only the week under way. */
async function holdWeek(w: Writer, u: WeekLearner, weekStart: string) {
	const goal = u.weeklyGoal ?? (await w.select({ g: user.weeklyGoal }).from(user).where(eq(user.id, u.id)))[0]?.g ?? 3;
	await w.insert(userWeek).values({ userId: u.id, weekStart, goal }).onConflictDoNothing();
}

/** The learner changed their weekly aim: the week under way is held to the new one. */
export async function setWeekGoal(u: WeekLearner, goal: number, at = new Date()) {
	const weekStart = weekStartOf(localDay(at, zoneOf(u)));
	await db
		.insert(userWeek)
		.values({ userId: u.id, weekStart, goal })
		.onConflictDoUpdate({ target: [userWeek.userId, userWeek.weekStart], set: { goal } });
}

const kindOf = (r: { learnedAt: Date | null; reviewedAt: Date | null } | undefined): DayKind =>
	!r ? "none" : r.learnedAt && r.reviewedAt ? "full" : r.learnedAt ? "learned" : r.reviewedAt ? "reviewed" : "none";

async function daysBetween(userId: string, from: string, to: string) {
	const rows = await db
		.select({ day: practiceDay.day, learnedAt: practiceDay.learnedAt, reviewedAt: practiceDay.reviewedAt })
		.from(practiceDay)
		.where(and(eq(practiceDay.userId, userId), between(practiceDay.day, from, to)));
	return new Map(rows.map((r) => [r.day, r]));
}
async function goalsFrom(userId: string, from: string) {
	const rows = await db
		.select({ weekStart: userWeek.weekStart, goal: userWeek.goal })
		.from(userWeek)
		.where(and(eq(userWeek.userId, userId), gte(userWeek.weekStart, from)));
	return new Map(rows.map((r) => [r.weekStart, r.goal]));
}

/** This week, Monday first: each day's halves, and today. */
export async function weekOf(u: WeekLearner & { weeklyGoal: number }, at = new Date()): Promise<WeekView> {
	const today = localDay(at, zoneOf(u));
	const start = weekStartOf(today);
	const [days, goals] = await Promise.all([daysBetween(u.id, start, addDays(start, 6)), goalsFrom(u.id, start)]);
	return {
		today,
		goal: goals.get(start) ?? u.weeklyGoal,
		days: Array.from({ length: 7 }, (_, i) => {
			const day = addDays(start, i);
			return { day, kind: day > today ? "later" : kindOf(days.get(day)) };
		}),
	};
}

/** The weeks behind this one, oldest first, each with the aim it was held to (weeks never written: the goal then in force). */
export async function historyOf(u: WeekLearner & { weeklyGoal: number }, weeks: number, at = new Date()): Promise<HistoryWeek[]> {
	const today = localDay(at, zoneOf(u));
	const last = weekStartOf(today);
	const first = addDays(last, -7 * (weeks - 1));
	const [days, goals] = await Promise.all([daysBetween(u.id, first, today), goalsFrom(u.id, first)]);
	return Array.from({ length: weeks }, (_, w) => {
		const start = addDays(first, 7 * w);
		return {
			start,
			goal: goals.get(start) ?? u.weeklyGoal,
			days: Array.from({ length: 7 }, (_, i) => {
				const day = addDays(start, i);
				return day > today ? "later" : kindOf(days.get(day));
			}),
		};
	});
}
