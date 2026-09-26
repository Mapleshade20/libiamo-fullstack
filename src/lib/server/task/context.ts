/**
 * Task URLs name only the task. This module resolves the rest on the server: which lineup a new
 * attempt joins and which existing attempt a page shows.
 */

import { and, desc, eq } from "drizzle-orm";
import type { InteractionType, LanguageCode } from "$lib/constants";
import { db } from "$lib/server/db";
import { practiceSession, task } from "$lib/server/db/schema";
import { getLocalDateString } from "$lib/server/task/lineup-dates";
import { resolveTaskLineup } from "$lib/server/task/lineups";
import { type AttemptContext, pickShownAttempt } from "$lib/task/attempts";
import { getBrowserTimezone } from "$lib/time/browser-timezone";

export interface TaskIdentity {
	id: number;
	interactionType: InteractionType;
	language: LanguageCode;
}

export function parseTaskId(value: string): number | null {
	const id = Number(value);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function getTaskIdentity(taskId: number): Promise<TaskIdentity | null> {
	const [found] = await db
		.select({ id: task.id, interactionType: task.interactionType, language: task.language })
		.from(task)
		.where(eq(task.id, taskId))
		.limit(1);
	return found ?? null;
}

/** The lineup context of a task request; `?lineup=` pins it to one lineup containing the task. */
export async function resolveRequestLineup(
	event: { url: URL; cookies: { get(name: string): string | undefined } },
	identity: TaskIdentity,
): Promise<AttemptContext> {
	const requested = parseTaskId(event.url.searchParams.get("lineup") ?? "");
	return resolveTaskLineup({
		taskId: identity.id,
		language: identity.language,
		localDate: getLocalDateString(getBrowserTimezone(event.cookies)),
		requestedLineupId: requested,
	});
}

/** The practice session a task URL shows; see `pickShownAttempt`. */
export async function findPracticeSession(userId: string, taskId: number, context: AttemptContext) {
	const sessions = await db
		.select({
			id: practiceSession.id,
			lineupId: practiceSession.lineupId,
			status: practiceSession.status,
			evaluationPhase: practiceSession.evaluationPhase,
		})
		.from(practiceSession)
		.where(and(eq(practiceSession.userId, userId), eq(practiceSession.taskId, taskId)))
		.orderBy(desc(practiceSession.startedAt), desc(practiceSession.id));
	return pickShownAttempt(
		sessions.map((session) => ({
			...session,
			finished: session.status === "abandoned" || (session.status !== "in_progress" && session.evaluationPhase === "completed"),
		})),
		context,
	);
}
