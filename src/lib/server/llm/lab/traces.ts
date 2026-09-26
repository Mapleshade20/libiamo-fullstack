import { and, count, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { LAB_TRACE_RETENTION_DAYS, type TraceError, type TraceOrigin, type TraceVariant } from "$lib/llm/lab";
import { db } from "$lib/server/db";
import { user } from "$lib/server/db/auth.schema";
import { llmRating, llmTrace } from "$lib/server/db/schema";
import type { LlmCallRecord, LlmVariant } from "../run";

export function traceVariant(variant: LlmVariant | null, label?: string): TraceVariant | null {
	if (!variant && !label) return null;
	return {
		...(label ? { label } : {}),
		...(variant?.slots && Object.keys(variant.slots).length ? { slots: { ...variant.slots } } : {}),
		...(variant?.provider ? { providerId: variant.provider.id } : {}),
		...(variant?.options && Object.keys(variant.options).length ? { options: { ...variant.options } } : {}),
		...(variant?.messages ? { messagesEdited: true } : {}),
	};
}

function traceError(record: LlmCallRecord): TraceError | null {
	if (!record.error) return null;
	const error = record.error instanceof Error ? record.error : new Error(String(record.error));
	return { name: error.name, message: error.message, stage: record.errorStage ?? "provider" };
}

function usageNumber(usage: unknown, key: "promptTokens" | "completionTokens"): number | null {
	const value = (usage as Record<string, unknown> | undefined)?.[key];
	return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

/** JSON round trip: recipe inputs and outputs are JSON-plain, and jsonb must not see `undefined` or class instances. */
function plain(value: unknown): unknown {
	return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

export type TraceOwner = { label?: string; runId?: number };

export function traceRow(record: LlmCallRecord, owner: TraceOwner = {}): typeof llmTrace.$inferInsert {
	const lastAttempt = record.attempts.at(-1);
	return {
		userId: record.userId ?? null,
		origin: record.origin,
		recipeId: record.recipe.id,
		recipeVersion: record.recipe.version,
		taskId: record.subjects?.taskId ?? null,
		sessionId: record.subjects?.sessionId ?? null,
		translationAttemptId: record.subjects?.translationAttemptId ?? null,
		status: record.error ? "error" : "ok",
		input: plain(record.input),
		variant: traceVariant(record.variant, owner.label),
		runId: owner.runId ?? null,
		overrideId: record.overrideId ?? null,
		messages: record.messages,
		options: record.options,
		attempts: plain(record.attempts) as typeof llmTrace.$inferInsert.attempts,
		output: record.value === null || record.value === undefined ? null : plain(record.value),
		outputText: record.response?.content ?? lastAttempt?.content ?? null,
		error: traceError(record),
		route: record.response?.route ?? null,
		promptTokens: usageNumber(record.response?.usage, "promptTokens"),
		completionTokens: usageNumber(record.response?.usage, "completionTokens"),
		latencyMs: record.latencyMs,
	};
}

export async function insertTrace(record: LlmCallRecord, owner: TraceOwner = {}): Promise<string> {
	const [row] = await db.insert(llmTrace).values(traceRow(record, owner)).returning({ id: llmTrace.id });
	return row.id;
}

/**
 * Deletes traces past retention: real-flow calls and Playground runs. Run outputs and judge calls
 * live as long as their run (`run_id` cascades).
 */
export async function purgeExpiredTraces(now = new Date()): Promise<number> {
	const cutoff = new Date(now.getTime() - LAB_TRACE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
	const deleted = await db
		.delete(llmTrace)
		.where(and(isNull(llmTrace.runId), lt(llmTrace.createdAt, cutoff)))
		.returning({ id: llmTrace.id });
	return deleted.length;
}

export type TraceListFilters = {
	recipeId?: string;
	userId?: string;
	taskId?: number;
	origin?: TraceOrigin;
	status?: "ok" | "error";
	limit?: number;
	/** Only traces created before this one (keyset pagination). */
	before?: Date;
};

const traceSummaryColumns = {
	id: llmTrace.id,
	createdAt: llmTrace.createdAt,
	origin: llmTrace.origin,
	recipeId: llmTrace.recipeId,
	recipeVersion: llmTrace.recipeVersion,
	status: llmTrace.status,
	userId: llmTrace.userId,
	userName: user.name,
	userEmail: user.email,
	taskId: llmTrace.taskId,
	sessionId: llmTrace.sessionId,
	translationAttemptId: llmTrace.translationAttemptId,
	latencyMs: llmTrace.latencyMs,
	completionTokens: llmTrace.completionTokens,
	route: llmTrace.route,
	variant: llmTrace.variant,
	runId: llmTrace.runId,
	error: llmTrace.error,
	attemptCount: sql<number>`jsonb_array_length(${llmTrace.attempts})::int`,
};

function traceConditions(filters: TraceListFilters) {
	return [
		filters.recipeId ? eq(llmTrace.recipeId, filters.recipeId) : undefined,
		filters.userId ? eq(llmTrace.userId, filters.userId) : undefined,
		filters.taskId !== undefined ? eq(llmTrace.taskId, filters.taskId) : undefined,
		filters.origin ? eq(llmTrace.origin, filters.origin) : undefined,
		filters.status ? eq(llmTrace.status, filters.status) : undefined,
		filters.before ? lt(llmTrace.createdAt, filters.before) : undefined,
	].filter((condition) => condition !== undefined);
}

export async function listTraces(filters: TraceListFilters = {}) {
	const conditions = traceConditions(filters);
	return db
		.select(traceSummaryColumns)
		.from(llmTrace)
		.leftJoin(user, eq(user.id, llmTrace.userId))
		.where(conditions.length ? and(...conditions) : undefined)
		.orderBy(desc(llmTrace.createdAt))
		.limit(Math.min(Math.max(filters.limit ?? 50, 1), 200));
}

export type TraceSummary = Awaited<ReturnType<typeof listTraces>>[number];

export async function getTrace(id: string) {
	const [row] = await db
		.select({ trace: llmTrace, userName: user.name, userEmail: user.email })
		.from(llmTrace)
		.leftJoin(user, eq(user.id, llmTrace.userId))
		.where(eq(llmTrace.id, id))
		.limit(1);
	if (!row) return null;
	const ratings = await db
		.select({ userId: llmRating.userId, userName: user.name, vote: llmRating.vote, note: llmRating.note, updatedAt: llmRating.updatedAt })
		.from(llmRating)
		.leftJoin(user, eq(user.id, llmRating.userId))
		.where(eq(llmRating.traceId, id))
		.orderBy(desc(llmRating.updatedAt));
	return { ...row.trace, userName: row.userName, userEmail: row.userEmail, ratings };
}

export type TraceDetail = NonNullable<Awaited<ReturnType<typeof getTrace>>>;

export async function rateTrace(input: { traceId: string; userId: string; vote: -1 | 0 | 1; note: string }) {
	await db
		.insert(llmRating)
		.values({ ...input, updatedAt: new Date() })
		.onConflictDoUpdate({ target: [llmRating.traceId, llmRating.userId], set: { vote: input.vote, note: input.note, updatedAt: new Date() } });
}

/** Filters for bulk deletion: a whole filtered view, never one page of it. */
export type TraceMatchFilters = Omit<TraceListFilters, "limit" | "before">;

/** How many traces a filter matches, split by whether deletion may remove them. */
export async function countMatchingTraces(filters: TraceMatchFilters) {
	const [row] = await db
		.select({ deletable: count(sql`CASE WHEN ${isNull(llmTrace.runId)} THEN 1 END`), inRuns: count(llmTrace.runId) })
		.from(llmTrace)
		.where(and(...traceConditions(filters)));
	return { deletable: row?.deletable ?? 0, inRuns: row?.inRuns ?? 0 };
}

/**
 * Deletes traces by id or by filter. Run outputs and judge calls are skipped: their cells would be left
 * without results, so they go only with their run. Pinned dataset cases keep their input copy.
 */
export async function deleteTraces(selection: { ids: string[] } | { filters: TraceMatchFilters }) {
	const scope = "ids" in selection ? [inArray(llmTrace.id, selection.ids)] : traceConditions(selection.filters);
	if ("ids" in selection && selection.ids.length === 0) return { deleted: 0, keptInRuns: 0 };
	const deleted = await db
		.delete(llmTrace)
		.where(and(isNull(llmTrace.runId), ...scope))
		.returning({ id: llmTrace.id });
	const [kept] = await db
		.select({ total: count() })
		.from(llmTrace)
		.where(and(isNotNull(llmTrace.runId), ...scope));
	return { deleted: deleted.length, keptInRuns: kept?.total ?? 0 };
}
