/**
 * The distribution layer. A lineup is one occasion on which tasks are put in front of the learners
 * of a language; today that is the daily and weekly rotation. Tasks never reference lineups, and
 * attempts only carry an opaque `lineupId`, so this module is the single place to change when the
 * distribution strategy changes.
 */

import { and, asc, desc, eq, max, notInArray, sql } from "drizzle-orm";
import { type LanguageCode, LINEUP_SIZE, type LineupKind } from "$lib/constants";
import { db } from "$lib/server/db";
import { lineup, lineupRotation, lineupTask, task } from "$lib/server/db/schema";
import { getMondayOfWeekForDate } from "$lib/server/scheduling/dates";
import type { AttemptContext } from "$lib/task-attempts";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;

/** The `starts_on` date of each lineup kind that is current on a learner's local date. */
export function currentLineupStarts(localDate: string): Record<LineupKind, string> {
	return { daily: localDate, weekly: getMondayOfWeekForDate(localDate) };
}

async function getOrCreateLineup(executor: Executor, language: LanguageCode, kind: LineupKind, startsOn: string): Promise<number> {
	const filter = and(eq(lineup.language, language), eq(lineup.kind, kind), eq(lineup.startsOn, startsOn));
	const [existing] = await executor.select({ id: lineup.id }).from(lineup).where(filter).limit(1);
	if (existing) return existing.id;
	const [inserted] = await executor.insert(lineup).values({ language, kind, startsOn }).onConflictDoNothing().returning({ id: lineup.id });
	if (inserted) return inserted.id;
	const [winner] = await executor.select({ id: lineup.id }).from(lineup).where(filter).limit(1);
	if (!winner) throw new Error("Lineup creation lost a race but no winning lineup was found.");
	return winner.id;
}

async function appendTasks(tx: Transaction, lineupId: number, taskIds: number[], origin: "manual" | "auto") {
	if (taskIds.length === 0) return;
	const [{ last }] = await tx
		.select({ last: sql<number>`coalesce(max(${lineupTask.position}), 0)::int` })
		.from(lineupTask)
		.where(eq(lineupTask.lineupId, lineupId));
	await tx
		.insert(lineupTask)
		.values(taskIds.map((taskId, index) => ({ lineupId, taskId, position: last + index + 1, origin })))
		.onConflictDoNothing();
}

/**
 * Tops a lineup up to `LINEUP_SIZE` from the rotation pool, least recently lined up first. The
 * lineup row lock serializes concurrent hall loads so a lineup is never overfilled.
 */
async function fillLineup(lineupId: number, language: LanguageCode, kind: LineupKind) {
	await db.transaction(async (tx) => {
		await tx.select({ id: lineup.id }).from(lineup).where(eq(lineup.id, lineupId)).for("update");
		const entries = await tx.select({ taskId: lineupTask.taskId }).from(lineupTask).where(eq(lineupTask.lineupId, lineupId));
		const needed = LINEUP_SIZE - entries.length;
		if (needed <= 0) return;

		const present = entries.map((entry) => entry.taskId);
		const candidates = await tx
			.select({ id: task.id })
			.from(lineupRotation)
			.innerJoin(task, eq(task.id, lineupRotation.taskId))
			.leftJoin(lineupTask, eq(lineupTask.taskId, task.id))
			.leftJoin(lineup, eq(lineup.id, lineupTask.lineupId))
			.where(
				and(
					eq(lineupRotation.kind, kind),
					eq(task.language, language),
					eq(task.isActive, true),
					present.length > 0 ? notInArray(task.id, present) : undefined,
				),
			)
			.groupBy(task.id)
			.orderBy(sql`${max(lineup.startsOn)} asc nulls first`, asc(task.id))
			.limit(needed);
		await appendTasks(
			tx,
			lineupId,
			candidates.map((candidate) => candidate.id),
			"auto",
		);
	});
}

async function ensureLineup(language: LanguageCode, kind: LineupKind, startsOn: string): Promise<number> {
	const lineupId = await getOrCreateLineup(db, language, kind, startsOn);
	const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(lineupTask).where(eq(lineupTask.lineupId, lineupId));
	if (count < LINEUP_SIZE) await fillLineup(lineupId, language, kind);
	return lineupId;
}

/** Creates and auto-fills the lineups current on the learner's local date. */
export async function ensureCurrentLineups(language: LanguageCode, localDate: string): Promise<Record<LineupKind, number>> {
	const starts = currentLineupStarts(localDate);
	return {
		daily: await ensureLineup(language, "daily", starts.daily),
		weekly: await ensureLineup(language, "weekly", starts.weekly),
	};
}

/** The ids of the lineups current on a local date, without creating any. */
export async function findCurrentLineupIds(language: LanguageCode, localDate: string): Promise<number[]> {
	const starts = currentLineupStarts(localDate);
	const rows = await db
		.select({ id: lineup.id })
		.from(lineup)
		.where(
			and(
				eq(lineup.language, language),
				sql`(${lineup.kind}, ${lineup.startsOn}) in (('daily', ${starts.daily}::date), ('weekly', ${starts.weekly}::date))`,
			),
		);
	return rows.map((row) => row.id);
}

export async function listLineupTasks(lineupId: number) {
	return db
		.select({
			id: task.id,
			title: task.title,
			shortObjective: task.shortObjective,
			ui: task.ui,
			difficulty: task.difficulty,
			origin: lineupTask.origin,
		})
		.from(lineupTask)
		.innerJoin(task, eq(task.id, lineupTask.taskId))
		.where(eq(lineupTask.lineupId, lineupId))
		.orderBy(asc(lineupTask.position));
}

export async function findLineup(language: LanguageCode, kind: LineupKind, startsOn: string) {
	const [found] = await db
		.select({ id: lineup.id })
		.from(lineup)
		.where(and(eq(lineup.language, language), eq(lineup.kind, kind), eq(lineup.startsOn, startsOn)))
		.limit(1);
	return found ?? null;
}

export class LineupError extends Error {}

/** Adds a task to a lineup by hand, creating the lineup when needed. */
export async function addTaskToLineup(input: { taskId: number; kind: LineupKind; startsOn: string }): Promise<void> {
	const [target] = await db
		.select({ language: task.language, interactionType: task.interactionType, isActive: task.isActive })
		.from(task)
		.where(eq(task.id, input.taskId))
		.limit(1);
	if (!target) throw new LineupError("Task not found");
	if (!target.isActive) throw new LineupError("Only active tasks can be lined up");
	const lineupId = await getOrCreateLineup(db, target.language, input.kind, input.startsOn);
	await db.transaction(async (tx) => {
		await tx.select({ id: lineup.id }).from(lineup).where(eq(lineup.id, lineupId)).for("update");
		const [present] = await tx
			.select({ taskId: lineupTask.taskId })
			.from(lineupTask)
			.where(and(eq(lineupTask.lineupId, lineupId), eq(lineupTask.taskId, input.taskId)))
			.limit(1);
		if (present) throw new LineupError("This task is already in that lineup");
		await appendTasks(tx, lineupId, [input.taskId], "manual");
	});
}

/**
 * The lineup context of a task request: an explicitly requested lineup that contains the task
 * (pinned), else a current lineup containing it, else the most recent one, else none.
 */
export async function resolveTaskLineup(input: {
	taskId: number;
	language: LanguageCode;
	localDate: string;
	requestedLineupId?: number | null;
}): Promise<AttemptContext> {
	const memberships = await db
		.select({ lineupId: lineupTask.lineupId })
		.from(lineupTask)
		.innerJoin(lineup, eq(lineup.id, lineupTask.lineupId))
		.where(eq(lineupTask.taskId, input.taskId))
		.orderBy(desc(lineup.startsOn), desc(lineup.id));
	const ids = memberships.map((membership) => membership.lineupId);
	if (ids.length === 0) return { lineupId: null, pinned: false };
	if (input.requestedLineupId && ids.includes(input.requestedLineupId)) return { lineupId: input.requestedLineupId, pinned: true };
	const currentIds = await findCurrentLineupIds(input.language, input.localDate);
	return { lineupId: ids.find((id) => currentIds.includes(id)) ?? ids[0], pinned: false };
}
