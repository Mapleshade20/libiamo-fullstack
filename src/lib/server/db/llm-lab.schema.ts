import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import type { ReasoningEffort } from "$lib/constants";
import type { LabJudgeResult, LabRunJudge, LabVariantSpec, TraceAttempt, TraceError, TraceVariant } from "$lib/llm/lab";
import type { ChatMessage, ChatOptions, LlmRouteInfo } from "$lib/server/llm/client";
import { user } from "./auth.schema";

// LLM Lab (docs/design/2026-09-24-llm-lab.md). Diagnostics only: no domain table references these,
// and subject ids are plain integers so traces never constrain domain deletes.

// ── llmTrace ────────────────────────────────────────────────────────
export const llmTrace = pgTable(
	"llm_trace",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		origin: text("origin").$type<"app" | "override" | "lab">().notNull(),
		recipeId: text("recipe_id").notNull(),
		recipeVersion: integer("recipe_version").notNull(),
		taskId: integer("task_id"),
		sessionId: integer("session_id"),
		translationAttemptId: integer("translation_attempt_id"),
		status: text("status").$type<"ok" | "error">().notNull(),
		input: jsonb("input").notNull(),
		variant: jsonb("variant").$type<TraceVariant>(),
		overrideId: integer("override_id").references(() => llmOverride.id, { onDelete: "set null" }),
		/** The Lab run that produced this trace (outputs and judge calls); deleting the run deletes it. */
		runId: integer("run_id").references(() => llmRun.id, { onDelete: "cascade" }),
		messages: jsonb("messages").$type<ChatMessage[]>().notNull(),
		options: jsonb("options").$type<ChatOptions>().notNull(),
		attempts: jsonb("attempts").$type<TraceAttempt[]>().notNull(),
		/** The final value, or the parsed value that `finalize` rejected. */
		output: jsonb("output"),
		outputText: text("output_text"),
		error: jsonb("error").$type<TraceError>(),
		route: jsonb("route").$type<LlmRouteInfo>(),
		promptTokens: integer("prompt_tokens"),
		completionTokens: integer("completion_tokens"),
		latencyMs: integer("latency_ms").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [
		index("llm_trace_created_idx").on(t.createdAt),
		index("llm_trace_user_task_idx").on(t.userId, t.taskId, t.createdAt),
		index("llm_trace_recipe_idx").on(t.recipeId, t.createdAt),
		index("llm_trace_run_idx").on(t.runId),
		check("llm_trace_origin_check", sql`${t.origin} IN ('app', 'override', 'lab')`),
		check("llm_trace_status_check", sql`${t.status} IN ('ok', 'error')`),
	],
);

// ── llmTraceOptOut ──────────────────────────────────────────────────
/**
 * Learners with their own API key who turned trace capture off. Capture is on by default; the
 * setting only exists (and this row only counts) while the learner has a key.
 */
export const llmTraceOptOut = pgTable("llm_trace_opt_out", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	optedOutAt: timestamp("opted_out_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── llmOverride ─────────────────────────────────────────────────────
/** A staff member's experimental variant of one recipe, applied to their own real-flow calls. */
export const llmOverride = pgTable(
	"llm_override",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		recipeId: text("recipe_id").notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		slots: jsonb("slots").$type<Record<string, string>>().default({}).notNull(),
		providerRef: text("provider_ref"),
		temperature: doublePrecision("temperature"),
		reasoningEffort: text("reasoning_effort").$type<ReasoningEffort>(),
		note: text("note").default("").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [unique("llm_override_user_recipe_unique").on(t.userId, t.recipeId)],
);

// ── llmDataset / llmDatasetCase ─────────────────────────────────────
export const llmDataset = pgTable("llm_dataset", {
	id: serial("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description").default("").notNull(),
	recipeId: text("recipe_id").notNull(),
	judgeRubric: text("judge_rubric"),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A pinned input. Kept until deleted by staff; when the learner it came from deletes their account,
 * `source_user_id` is cleared and the content is kept (disclosed in the privacy policy).
 */
export const llmDatasetCase = pgTable(
	"llm_dataset_case",
	{
		id: serial("id").primaryKey(),
		datasetId: integer("dataset_id")
			.notNull()
			.references(() => llmDataset.id, { onDelete: "cascade" }),
		recipeVersion: integer("recipe_version").notNull(),
		input: jsonb("input").notNull(),
		label: text("label").default("").notNull(),
		sourceTraceId: uuid("source_trace_id").references(() => llmTrace.id, { onDelete: "set null" }),
		sourceUserId: text("source_user_id").references(() => user.id, { onDelete: "set null" }),
		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [index("llm_dataset_case_dataset_idx").on(t.datasetId)],
);

// ── llmRun / llmRunCell ─────────────────────────────────────────────
export const llmRun = pgTable("llm_run", {
	id: serial("id").primaryKey(),
	datasetId: integer("dataset_id")
		.notNull()
		.references(() => llmDataset.id, { onDelete: "cascade" }),
	label: text("label").default("").notNull(),
	variants: jsonb("variants").$type<LabVariantSpec[]>().notNull(),
	repeats: integer("repeats").default(1).notNull(),
	judge: jsonb("judge").$type<LabRunJudge>(),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
	cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One case × variant × repeat of a run: a job row claimed by the Lab worker. */
export const llmRunCell = pgTable(
	"llm_run_cell",
	{
		id: serial("id").primaryKey(),
		runId: integer("run_id")
			.notNull()
			.references(() => llmRun.id, { onDelete: "cascade" }),
		caseId: integer("case_id")
			.notNull()
			.references(() => llmDatasetCase.id, { onDelete: "cascade" }),
		variantKey: text("variant_key").notNull(),
		repeatIndex: integer("repeat_index").default(0).notNull(),
		status: text("status").$type<"pending" | "running" | "done" | "failed" | "cancelled">().default("pending").notNull(),
		leaseUntil: timestamp("lease_until", { withTimezone: true }),
		/** New on every claim; only the holder may write results. `attempts` only budgets retries. */
		claimToken: uuid("claim_token"),
		attempts: integer("attempts").default(0).notNull(),
		traceId: uuid("trace_id").references(() => llmTrace.id, { onDelete: "set null" }),
		judge: jsonb("judge").$type<LabJudgeResult>(),
		error: text("error"),
		completedAt: timestamp("completed_at", { withTimezone: true }),
	},
	(t) => [
		unique("llm_run_cell_unique").on(t.runId, t.caseId, t.variantKey, t.repeatIndex),
		index("llm_run_cell_status_idx").on(t.status, t.leaseUntil),
		check("llm_run_cell_status_check", sql`${t.status} IN ('pending', 'running', 'done', 'failed', 'cancelled')`),
	],
);

// ── llmRating ───────────────────────────────────────────────────────
/** One staff member's vote and note on a traced output (a run cell or a real-flow call). */
export const llmRating = pgTable(
	"llm_rating",
	{
		id: serial("id").primaryKey(),
		traceId: uuid("trace_id")
			.notNull()
			.references(() => llmTrace.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		vote: smallint("vote").notNull(),
		note: text("note").default("").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => [unique("llm_rating_trace_user_unique").on(t.traceId, t.userId), check("llm_rating_vote_check", sql`${t.vote} IN (-1, 0, 1)`)],
);

export const llmTraceRelations = relations(llmTrace, ({ one, many }) => ({
	user: one(user, { fields: [llmTrace.userId], references: [user.id] }),
	ratings: many(llmRating),
}));

export const llmDatasetRelations = relations(llmDataset, ({ many }) => ({
	cases: many(llmDatasetCase),
	runs: many(llmRun),
}));

export const llmDatasetCaseRelations = relations(llmDatasetCase, ({ one }) => ({
	dataset: one(llmDataset, { fields: [llmDatasetCase.datasetId], references: [llmDataset.id] }),
}));

export const llmRunRelations = relations(llmRun, ({ one, many }) => ({
	dataset: one(llmDataset, { fields: [llmRun.datasetId], references: [llmDataset.id] }),
	cells: many(llmRunCell),
}));

export const llmRunCellRelations = relations(llmRunCell, ({ one }) => ({
	run: one(llmRun, { fields: [llmRunCell.runId], references: [llmRun.id] }),
	case: one(llmDatasetCase, { fields: [llmRunCell.caseId], references: [llmDatasetCase.id] }),
	trace: one(llmTrace, { fields: [llmRunCell.traceId], references: [llmTrace.id] }),
}));

export const llmRatingRelations = relations(llmRating, ({ one }) => ({
	trace: one(llmTrace, { fields: [llmRating.traceId], references: [llmTrace.id] }),
	user: one(user, { fields: [llmRating.userId], references: [user.id] }),
}));
