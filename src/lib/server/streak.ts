import { and, eq, gte, lte, sql } from "drizzle-orm";
import { dev } from "$app/environment";
import { getRequestEvent } from "$app/server";
import {
	applyQuestCompletion,
	applyReviewObservation,
	effectiveToday,
	emptyStreakRecord,
	localDay,
	type StreakRecord,
	streakRecordsEqual,
} from "$lib/streak";
import { calendarDays, historyChanges, monthRange, type StreakCalendarData } from "$lib/streak-history";
import { db } from "./db";
import { note, streakDay, userStreak } from "./db/schema";
import { ANKI_LEARN_AHEAD_MINUTES } from "./review";

export const DEV_STREAK_DAY_OFFSET_COOKIE = "libiamo-dev-streak-day-offset";

/**
 * Virtual day travel for `/streak-lab`, in days.
 *
 * Reading the request's cookie here rather than plumbing an offset through five call sites is what
 * makes "come back tomorrow" testable against the real quest paths. It is compiled out of a
 * production build, and it falls back to zero outside a request (the reply worker, tests).
 */
export function devStreakDayOffset(): number {
	if (!dev) return 0;
	try {
		const days = Number(getRequestEvent().cookies.get(DEV_STREAK_DAY_OFFSET_COOKIE));
		return Number.isFinite(days) ? Math.trunc(days) : 0;
	} catch {
		return 0;
	}
}

function travelled(at: Date): Date {
	const offset = devStreakDayOffset();
	return offset === 0 ? at : new Date(at.getTime() + offset * 86_400_000);
}

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select" | "insert" | "update">;

function toRecord(row: typeof userStreak.$inferSelect): StreakRecord {
	return {
		streakDays: row.streakDays,
		throughDate: row.throughDate,
		bank: row.bank,
		progressDate: row.progressDate,
		taskCount: row.taskCount,
		reviewCleared: row.reviewCleared,
		bankEarnedToday: row.bankEarnedToday,
	};
}

export async function getStreakRecord(userId: string): Promise<StreakRecord | null> {
	const [row] = await db.select().from(userStreak).where(eq(userStreak.userId, userId)).limit(1);
	return row ? toRecord(row) : null;
}

export async function getStreakCalendar(userId: string, month: string, today: string): Promise<StreakCalendarData> {
	const { from, to } = monthRange(month);
	// One snapshot: the aggregate and its daily marks are committed atomically by the writer.
	return db.transaction(
		async (tx) => {
			const [row] = await tx.select().from(userStreak).where(eq(userStreak.userId, userId)).limit(1);
			const stored = await tx
				.select({ day: streakDay.day, state: streakDay.state })
				.from(streakDay)
				.where(and(eq(streakDay.userId, userId), gte(streakDay.day, from), lte(streakDay.day, to)));
			const record = row ? toRecord(row) : null;
			return { days: calendarDays(stored, record, effectiveToday(record, today), from, to), since: row?.historySince ?? null };
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
}

/**
 * Is any Note of this learner available for study right now, across every language?
 *
 * This duplicates `isReviewCardAvailable` in SQL, pinned to it by an equivalence test. It compares
 * the stored strings directly instead of casting: `serializeCard` always writes `toISOString()`, so
 * the format is fixed-width UTC and lexicographic order is chronological, and a cast is what would
 * let one malformed `fsrs_card` abort a quest-completion transaction. The known divergence is that
 * `deserializeCard` falls back to "now" for a malformed `due` while this comparison generally does
 * not, so a corrupt row may leave the queue looking empty — the safe direction.
 */
export async function isReviewQueueEmpty(reader: Pick<typeof db, "select">, userId: string, at: Date): Promise<boolean> {
	const { nowIso, learnAheadIso } = availabilityBounds(at);
	const rows = await reader
		.select({ one: sql<number>`1` })
		.from(note)
		.where(
			sql`${note.userId} = ${userId} and (
				${note.fsrsCard}->>'due' <= ${nowIso}
				or (${note.fsrsCard}->>'state' in ('1', '3') and ${note.fsrsCard}->>'due' <= ${learnAheadIso})
			)`,
		)
		.limit(1);
	return rows.length === 0;
}

export function availabilityBounds(at: Date) {
	return { nowIso: at.toISOString(), learnAheadIso: new Date(at.getTime() + ANKI_LEARN_AHEAD_MINUTES * 60_000).toISOString() };
}

/**
 * The predicate above, transcribed into TypeScript.
 *
 * It exists so the duplication can be pinned by a test: `test/lib/server/review-availability.test.ts`
 * checks it against `isReviewCardAvailable` over well-formed cards. Change the two together — this
 * function and the `where` clause above are one rule written twice, and a test cannot reach the
 * real SQL without a database.
 */
export function storedCardAvailable(stored: unknown, bounds: ReturnType<typeof availabilityBounds>): boolean {
	const card = (stored ?? {}) as Record<string, unknown>;
	const due = typeof card.due === "string" ? card.due : null;
	const state = card.state === undefined || card.state === null ? null : String(card.state);
	if (due === null) return false;
	return due <= bounds.nowIso || ((state === "1" || state === "3") && due <= bounds.learnAheadIso);
}

/** `SELECT … FOR UPDATE` cannot lock a row that does not exist, so create it first, then lock. */
async function lockRecord(writer: Reader, userId: string): Promise<StreakRecord> {
	await writer.insert(userStreak).values({ userId }).onConflictDoNothing({ target: userStreak.userId });
	const [row] = await writer.select().from(userStreak).where(eq(userStreak.userId, userId)).limit(1).for("update");
	return row ? toRecord(row) : emptyStreakRecord();
}

async function persist(writer: Reader, userId: string, before: StreakRecord, record: StreakRecord, today: string, timeZone: string) {
	const day = effectiveToday(before, today);
	const marks = historyChanges(before, record, day);
	if (marks.length)
		await writer
			.insert(streakDay)
			.values(marks.map((mark) => ({ userId, ...mark })))
			.onConflictDoNothing({ target: [streakDay.userId, streakDay.day] });
	await writer
		.update(userStreak)
		.set({
			streakDays: record.streakDays,
			throughDate: record.throughDate,
			bank: record.bank,
			progressDate: record.progressDate,
			historySince: sql`coalesce(${userStreak.historySince}, ${day}::date)`,
			taskCount: record.taskCount,
			reviewCleared: record.reviewCleared,
			bankEarnedToday: record.bankEarnedToday,
			timeZone,
			updatedAt: new Date(),
		})
		.where(eq(userStreak.userId, userId));
}

/**
 * Credit one completed quest.
 *
 * **Invariant, and the whole reason this needs no idempotency key: it may only be called from the
 * transaction that won the state-machine claim for that completion.** Every call site already
 * fences its transition, so a business event reaches this helper at most once.
 *
 * It runs its own work in a nested transaction — a savepoint under drizzle's postgres-js driver —
 * so that a caller which logs and swallows a streak failure does not abort the quest's transaction.
 * Swallowing without the savepoint aborts the outer transaction, so the two are one decision. There
 * is no retry: a swallowed failure is a permanently lost quest count for that day.
 */
export async function recordQuestCompletion(tx: Transaction, userId: string, at: Date, timeZone: string): Promise<void> {
	await tx.transaction(async (inner) => {
		const before = await lockRecord(inner, userId);
		const queueEmpty = await isReviewQueueEmpty(inner, userId, at);
		const today = localDay(travelled(at), timeZone);
		const after = applyQuestCompletion(before, today, queueEmpty);
		await persist(inner, userId, before, after, today, timeZone);
	});
}

/**
 * Record that the review queue was observed empty (or not) after a rating.
 *
 * Runs outside any caller transaction and after `rateNote` returns, so it sees post-rating due
 * dates. Returns the new record only when something actually changed, which is what tells the study
 * UI to invalidate the streak.
 */
export async function recordReviewObservation(userId: string, at: Date, timeZone: string): Promise<StreakRecord | null> {
	return db.transaction(async (tx) => {
		const before = await lockRecord(tx, userId);
		const queueEmpty = await isReviewQueueEmpty(tx, userId, at);
		const today = localDay(travelled(at), timeZone);
		const after = applyReviewObservation(before, today, queueEmpty);
		if (streakRecordsEqual(before, after)) return null;
		await persist(tx, userId, before, after, today, timeZone);
		return after;
	});
}

/** Fire-and-forget wrapper for the rating paths: a navbar counter must never fail a rating. */
export async function observeReviewQueue(userId: string, at: Date, timeZone: string): Promise<StreakRecord | null> {
	try {
		return await recordReviewObservation(userId, at, timeZone);
	} catch (cause) {
		console.error("Failed to record a streak review observation:", cause);
		return null;
	}
}

/** Savepoint-isolated wrapper for quest completion paths, for callers inside a transaction. */
export async function creditQuestCompletion(tx: Transaction, userId: string, at: Date, timeZone: string): Promise<void> {
	try {
		await recordQuestCompletion(tx, userId, at, timeZone);
	} catch (cause) {
		console.error("Failed to credit a completed quest toward the streak:", cause);
	}
}
