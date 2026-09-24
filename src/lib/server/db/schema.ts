import { relations, sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type { PracticeEvaluationPhase, TranslationWorkflowPhase } from "$lib/constants";
import type { ChatMessage } from "$lib/server/llm";
import type { Generation1Evaluation } from "$lib/server/translation/evaluation/schema";
import { STREAK_DAY_STATES, type StreakDayState } from "$lib/streak/history";
import type { TranslationCardWarning } from "$lib/translation/evaluation";
import { user } from "./auth.schema";
import {
	agentDeliveryStatusEnum,
	agentResponseBatchKindEnum,
	agentResponseBatchStatusEnum,
	interactionTypeEnum,
	languageCodeEnum,
	lineupKindEnum,
	lineupOriginEnum,
	messageRoleEnum,
	sessionCompletionReasonEnum,
	sessionStatusEnum,
	uiVariantEnum,
	urgencyEnum,
} from "./enums";

// Sparse outcomes; the composite primary key also serves bounded calendar range queries.
export const streakDay = pgTable(
	"streak_day",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		day: date("day").notNull(),
		state: text("state").$type<StreakDayState>().notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.day] }),
		// `sql.raw` because a check constraint is serialized into the migration as text: a bound
		// parameter would not survive. The values are a local literal, never input.
		check("streak_day_state_check", sql`${t.state} in (${sql.raw(STREAK_DAY_STATES.map((state) => `'${state}'`).join(", "))})`),
	],
);

// ── task ─────────────────────────────────────────────────────────────
/**
 * One static piece of content. It knows nothing about how it reaches learners (see lineups) and
 * nothing is snapshotted from it: every consumer reads the live row, so edits apply everywhere.
 */
export const task = pgTable(
	"task",
	{
		id: serial("id").primaryKey(),
		interactionType: interactionTypeEnum("interaction_type").notNull(),
		language: languageCodeEnum("language").notNull(),
		ui: uiVariantEnum("ui").notNull(),
		isActive: boolean("is_active").default(true).notNull(),
		difficulty: integer("difficulty").notNull(),

		title: text("title").notNull(),
		shortObjective: text("short_objective"),
		description: text("description"),
		objectives: text("objectives").array(),
		materialsMd: text("materials_md"),
		tags: text("tags").array(),
		estimatedWords: integer("estimated_words"),

		// chat
		urgency: urgencyEnum("urgency"),
		/** Null means the conversation has no turn limit. */
		maxTurns: integer("max_turns"),
		agentPrompt: text("agent_prompt"),
		openingState: jsonb("opening_state").$type<Record<string, unknown>>(),

		// translate
		referenceParagraphs: jsonb("reference_paragraphs").$type<string[]>(),
		translationContext: text("translation_context"),

		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		index("task_language_type_idx").on(t.language, t.interactionType),
		check("task_difficulty_check", sql`${t.difficulty} BETWEEN 1 AND 3`),
		check("task_max_turns_check", sql`${t.maxTurns} IS NULL OR ${t.maxTurns} > 0`),
		check("task_estimated_words_check", sql`${t.estimatedWords} IS NULL OR ${t.estimatedWords} > 0`),
		check("task_translator_ui_check", sql`(${t.interactionType} = 'translate') = (${t.ui} = 'translator')`),
		check(
			"task_kind_fields_check",
			sql`CASE ${t.interactionType}
				WHEN 'chat' THEN ${t.urgency} IS NOT NULL AND ${t.openingState} IS NOT NULL AND ${t.referenceParagraphs} IS NULL AND ${t.translationContext} IS NULL
				ELSE ${t.urgency} IS NULL AND ${t.maxTurns} IS NULL AND ${t.agentPrompt} IS NULL AND ${t.openingState} IS NULL
					AND jsonb_typeof(${t.referenceParagraphs}) = 'array' AND jsonb_array_length(${t.referenceParagraphs}) > 0
					AND length(btrim(${t.translationContext})) > 0
			END`,
		),
	],
);

// ── taskContribution ──────────────────────────────────────────────────
/** A learner-proposed task awaiting review. Its content columns mirror `task`. */
export const taskContribution = pgTable(
	"task_contribution",
	{
		id: serial("id").primaryKey(),
		interactionType: interactionTypeEnum("interaction_type").notNull(),
		language: languageCodeEnum("language").notNull(),
		ui: uiVariantEnum("ui").notNull(),

		title: text("title").notNull(),
		shortObjective: text("short_objective"),
		description: text("description"),
		objectives: text("objectives").array(),
		materialsMd: text("materials_md"),
		tags: text("tags").array(),

		urgency: urgencyEnum("urgency"),
		agentPrompt: text("agent_prompt"),
		openingState: jsonb("opening_state").$type<Record<string, unknown>>(),

		referenceParagraphs: jsonb("reference_paragraphs").$type<string[]>(),
		translationContext: text("translation_context"),

		status: text("status", { enum: ["approved", "pending", "rejected"] })
			.$type<"approved" | "pending" | "rejected">()
			.default("pending")
			.notNull(),
		createdBy: text("created_by")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		reviewedBy: text("reviewed_by").references(() => user.id, { onDelete: "set null" }),
		reviewNotes: text("review_notes"),
		submittedAt: timestamp("submitted_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [index("task_contribution_status_idx").on(t.status, t.submittedAt), index("task_contribution_created_by_idx").on(t.createdBy)],
);

// ── lineup ────────────────────────────────────────────────────────────
/**
 * Distribution layer: a lineup is one occasion on which a set of tasks is put in front of the
 * learners of a language. Attempts reference `(lineup_id, task_id)` so completion is scoped to
 * the lineup entry; tasks never reference lineups, so this layer can be replaced wholesale.
 */
export const lineup = pgTable(
	"lineup",
	{
		id: serial("id").primaryKey(),
		language: languageCodeEnum("language").notNull(),
		kind: lineupKindEnum("kind").notNull(),
		startsOn: date("starts_on").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [uniqueIndex("lineup_language_kind_starts_on_idx").on(t.language, t.kind, t.startsOn)],
);

export const lineupTask = pgTable(
	"lineup_task",
	{
		lineupId: integer("lineup_id")
			.notNull()
			.references(() => lineup.id, { onDelete: "cascade" }),
		taskId: integer("task_id")
			.notNull()
			.references(() => task.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		origin: lineupOriginEnum("origin").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.lineupId, t.taskId] }), index("lineup_task_task_idx").on(t.taskId)],
);

/** The auto-fill pool: which tasks the daily/weekly strategy may pick. Owned by distribution. */
export const lineupRotation = pgTable("lineup_rotation", {
	taskId: integer("task_id")
		.primaryKey()
		.references(() => task.id, { onDelete: "cascade" }),
	kind: lineupKindEnum("kind").notNull(),
});

// ── practiceSession ────────────────────────────────────────────────────
export const practiceSession = pgTable(
	"practice_session",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		taskId: integer("task_id")
			.notNull()
			.references(() => task.id),
		/** The lineup entry this attempt belongs to; null when the task was not distributed. */
		lineupId: integer("lineup_id"),
		expiresAt: timestamp("expires_at").notNull(),
		status: sessionStatusEnum("status").default("in_progress").notNull(),
		completionReason: sessionCompletionReasonEnum("completion_reason"),
		lastProcessedUserMessageId: integer("last_processed_user_message_id"),
		lastSeenAssistantMessageId: integer("last_seen_assistant_message_id"),
		agentReadUpToMessageId: integer("agent_read_up_to_message_id"),
		followUpCount: integer("follow_up_count").default(0).notNull(),
		tutorFeedback: jsonb("tutor_feedback"),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
		/**
		 * Where the learner is on the evaluation page once the conversation has ended. Authoritative,
		 * like translation's `workflowPhase`: only the guarded move to `completed` credits the quest.
		 */
		evaluationPhase: text("evaluation_phase").$type<PracticeEvaluationPhase>().notNull().default("feedback"),
		evaluationCompletedAt: timestamp("evaluation_completed_at"),
	},
	(t) => [
		foreignKey({
			name: "practice_session_lineup_task_fk",
			columns: [t.lineupId, t.taskId],
			foreignColumns: [lineupTask.lineupId, lineupTask.taskId],
		}),
		unique("practice_session_user_task_lineup_key").on(t.userId, t.taskId, t.lineupId).nullsNotDistinct(),
		index("practice_session_task_idx").on(t.taskId),
		index("practice_session_archive_idx").on(t.userId, t.evaluationPhase, t.evaluationCompletedAt),
		index("practice_session_expiry_idx").on(t.status, t.expiresAt),
		check("practice_session_follow_up_count_check", sql`${t.followUpCount} >= 0 AND ${t.followUpCount} <= 2`),
		check("practice_session_evaluation_phase_check", sql`${t.evaluationPhase} IN ('feedback', 'transfer', 'completed')`),
	],
);

// ── agentResponseBatch ───────────────────────────────────────────────
export const agentResponseBatch = pgTable(
	"agent_response_batch",
	{
		id: serial("id").primaryKey(),
		sessionId: integer("session_id")
			.notNull()
			.references(() => practiceSession.id, { onDelete: "cascade" }),
		kind: agentResponseBatchKindEnum("kind").notNull(),
		status: agentResponseBatchStatusEnum("status").default("pending").notNull(),
		dueAt: timestamp("due_at").notNull(),
		inputMessageId: integer("input_message_id"),
		inputVersion: integer("input_version").default(0).notNull(),
		workerId: text("worker_id"),
		claimToken: text("claim_token"),
		claimedAt: timestamp("claimed_at"),
		leaseExpiresAt: timestamp("lease_expires_at"),
		generationCount: integer("generation_count").default(0).notNull(),
		staleCount: integer("stale_count").default(0).notNull(),
		requestMessages: jsonb("request_messages").$type<ChatMessage[]>(),
		rawResponse: text("raw_response"),
		parsedResult: jsonb("parsed_result"),
		providerMetadata: jsonb("provider_metadata"),
		error: text("error"),
		allowIdleFollowUp: boolean("allow_idle_follow_up"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
	},
	(t) => [
		index("agent_response_batch_status_due_idx").on(t.status, t.dueAt),
		index("agent_response_batch_session_status_idx").on(t.sessionId, t.status),
		check("agent_response_batch_input_version_check", sql`${t.inputVersion} >= 0`),
		check("agent_response_batch_generation_count_check", sql`${t.generationCount} >= 0`),
		check("agent_response_batch_stale_count_check", sql`${t.staleCount} >= 0`),
	],
);

// ── agentDelivery ────────────────────────────────────────────────────
export const agentDelivery = pgTable(
	"agent_delivery",
	{
		id: serial("id").primaryKey(),
		batchId: integer("batch_id")
			.notNull()
			.references(() => agentResponseBatch.id, { onDelete: "cascade" }),
		sequence: integer("sequence").notNull(),
		content: text("content").notNull(),
		replyToMessageId: integer("reply_to_message_id"),
		threadMetadata: jsonb("thread_metadata"),
		status: agentDeliveryStatusEnum("status").default("pending").notNull(),
		dueAt: timestamp("due_at").notNull(),
		deliveredAt: timestamp("delivered_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("agent_delivery_batch_sequence_idx").on(t.batchId, t.sequence),
		index("agent_delivery_status_due_idx").on(t.status, t.dueAt),
		check("agent_delivery_sequence_check", sql`${t.sequence} >= 0`),
	],
);

// ── sessionMessage ─────────────────────────────────────────────────────
export const sessionMessage = pgTable(
	"session_message",
	{
		id: serial("id").primaryKey(),
		sessionId: integer("session_id")
			.notNull()
			.references(() => practiceSession.id, { onDelete: "cascade" }),
		role: messageRoleEnum("role").notNull(),
		content: text("content").notNull(),
		llmMetadata: jsonb("llm_metadata"),
		responseBatchId: integer("response_batch_id").references(() => agentResponseBatch.id, { onDelete: "set null" }),
		deliveryId: integer("delivery_id").references(() => agentDelivery.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		index("session_message_session_idx").on(t.sessionId),
		uniqueIndex("session_message_delivery_idx").on(t.deliveryId),
		// Unread counts scan only replies past each session's watermark (`server/practice/unread.ts`).
		index("session_message_unread_idx").on(t.sessionId, t.id).where(sql`${t.role} = 'assistant'`),
	],
);

// ── translationSourceSet ────────────────────────────────────────────
export const translationSourceSet = pgTable(
	"translation_source_set",
	{
		id: serial("id").primaryKey(),
		taskId: integer("task_id")
			.notNull()
			.references(() => task.id),
		sourceLanguage: text("source_language").notNull(),
		promptLanguage: text("prompt_language").notNull(),
		referenceParagraphs: jsonb("reference_paragraphs").$type<string[]>().notNull(),
		context: text("context").notNull(),
		contentFingerprint: text("content_fingerprint").notNull(),
		candidates: jsonb("candidates").$type<string[][]>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("translation_source_set_task_prompt_fingerprint_idx").on(t.taskId, t.promptLanguage, t.contentFingerprint),
		unique("translation_source_set_id_task_key").on(t.id, t.taskId),
	],
);

// ── translationAttempt ──────────────────────────────────────────────
export type PersistedTranslationEvaluation = Omit<Generation1Evaluation, "cards"> & {
	cards: Array<Generation1Evaluation["cards"][number] & { warnings: TranslationCardWarning[] }>;
};

export const translationAttempt = pgTable(
	"translation_attempt",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		taskId: integer("task_id").notNull(),
		sourceSetId: integer("source_set_id").notNull(),
		/** The lineup entry this attempt belongs to; null when the task was not distributed. */
		lineupId: integer("lineup_id"),
		workflowPhase: text("workflow_phase").$type<TranslationWorkflowPhase>().notNull().default("draft"),
		evaluation: jsonb("evaluation").$type<PersistedTranslationEvaluation>(),
		generation1Messages: jsonb("generation_1_messages").$type<{ messages: ChatMessage[] }>(),
		feedbackLanguage: text("feedback_language"),
		submittedAt: timestamp("submitted_at"),
		evaluatedAt: timestamp("evaluated_at"),
		practiceGeneratedAt: timestamp("practice_generated_at"),
		completedAt: timestamp("completed_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		foreignKey({
			name: "translation_attempt_source_set_task_fk",
			columns: [t.sourceSetId, t.taskId],
			foreignColumns: [translationSourceSet.id, translationSourceSet.taskId],
		}),
		foreignKey({
			name: "translation_attempt_lineup_task_fk",
			columns: [t.lineupId, t.taskId],
			foreignColumns: [lineupTask.lineupId, lineupTask.taskId],
		}),
		// One unfinished attempt per source set and lineup entry; retaking a completed one is allowed.
		uniqueIndex("translation_attempt_active_idx")
			.on(t.userId, t.sourceSetId, sql`coalesce(${t.lineupId}, 0)`)
			.where(sql`${t.workflowPhase} <> 'completed'`),
		index("translation_attempt_user_task_idx").on(t.userId, t.taskId),
		index("translation_attempt_source_phase_idx").on(t.sourceSetId, t.workflowPhase),
		check(
			"translation_attempt_workflow_phase_check",
			sql`${t.workflowPhase} IN ('draft', 'submitted', 'correction', 'second_draft', 'transfer', 'completed')`,
		),
	],
);

// ── translationAnswer ───────────────────────────────────────────────
export const translationAnswer = pgTable(
	"translation_answer",
	{
		attemptId: integer("attempt_id")
			.notNull()
			.references(() => translationAttempt.id, { onDelete: "cascade" }),
		paragraphIndex: integer("paragraph_index").notNull(),
		translation: text("translation").notNull().default(""),
		candidateIndex: integer("candidate_index").notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		primaryKey({ columns: [t.attemptId, t.paragraphIndex] }),
		check("translation_answer_paragraph_index_check", sql`${t.paragraphIndex} >= 0`),
		check("translation_answer_candidate_index_check", sql`${t.candidateIndex} >= 0 AND ${t.candidateIndex} <= 2`),
	],
);

// ── note ───────────────────────────────────────────────────────────
export const note = pgTable(
	"note",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		language: languageCodeEnum("language").notNull(),
		sourceSessionId: integer("source_session_id").references(() => practiceSession.id, { onDelete: "cascade" }),
		sourceTranslationAttemptId: integer("source_translation_attempt_id").references(() => translationAttempt.id, { onDelete: "cascade" }),
		vocab: text("vocab").notNull(),
		targetDefinition: text("target_definition").notNull(),
		nativeDefinition: text("native_definition").notNull(),
		examples: jsonb("examples").$type<Array<{ targetText: string; nativeText: string }>>().notNull(),
		fsrsCard: jsonb("fsrs_card").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		index("note_user_id_idx").on(t.userId),
		index("note_source_session_id_idx").on(t.sourceSessionId),
		index("note_source_translation_attempt_id_idx").on(t.sourceTranslationAttemptId),
		check("note_exactly_one_source_check", sql`num_nonnulls(${t.sourceSessionId}, ${t.sourceTranslationAttemptId}) = 1`),
		check(
			"note_content_nonempty_check",
			sql`length(btrim(${t.vocab})) > 0 AND length(btrim(${t.targetDefinition})) > 0 AND length(btrim(${t.nativeDefinition})) > 0`,
		),
		check("note_examples_nonempty_check", sql`jsonb_typeof(${t.examples}) = 'array' AND jsonb_array_length(${t.examples}) > 0`),
	],
);

// ── reviewLog ───────────────────────────────────────────────────────
export const reviewLog = pgTable(
	"review_log",
	{
		id: serial("id").primaryKey(),
		noteId: integer("note_id")
			.notNull()
			.references(() => note.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		rating: integer("rating").notNull(),
		elapsedSeconds: integer("elapsed_seconds").notNull(),
		scheduledDays: integer("scheduled_days").notNull(),
		prevCard: jsonb("prev_card").notNull(),
		newCard: jsonb("new_card").notNull(),
		log: jsonb("log").notNull(),
		reviewedAt: timestamp("reviewed_at").defaultNow().notNull(),
	},
	(t) => [
		index("review_log_note_idx").on(t.noteId),
		index("review_log_user_reviewed_idx").on(t.userId, t.reviewedAt),
		check("review_log_rating_check", sql`${t.rating} >= 1 AND ${t.rating} <= 4`),
		check("review_log_elapsed_seconds_check", sql`${t.elapsedSeconds} >= 0`),
		check("review_log_scheduled_days_check", sql`${t.scheduledDays} >= 0`),
	],
);

// ── Relations ────────────────────────────────────────────────────────
export const taskRelations = relations(task, ({ one, many }) => ({
	createdByUser: one(user, { fields: [task.createdBy], references: [user.id] }),
	lineupEntries: many(lineupTask),
	rotation: one(lineupRotation),
	sessions: many(practiceSession),
	translationSourceSets: many(translationSourceSet),
}));

export const taskContributionRelations = relations(taskContribution, ({ one }) => ({
	createdByUser: one(user, {
		fields: [taskContribution.createdBy],
		references: [user.id],
		relationName: "contributionCreatedBy",
	}),
	reviewedByUser: one(user, {
		fields: [taskContribution.reviewedBy],
		references: [user.id],
		relationName: "contributionReviewedBy",
	}),
}));

export const lineupRelations = relations(lineup, ({ many }) => ({
	entries: many(lineupTask),
}));

export const lineupTaskRelations = relations(lineupTask, ({ one }) => ({
	lineup: one(lineup, { fields: [lineupTask.lineupId], references: [lineup.id] }),
	task: one(task, { fields: [lineupTask.taskId], references: [task.id] }),
}));

export const lineupRotationRelations = relations(lineupRotation, ({ one }) => ({
	task: one(task, { fields: [lineupRotation.taskId], references: [task.id] }),
}));

export const translationSourceSetRelations = relations(translationSourceSet, ({ one, many }) => ({
	task: one(task, {
		fields: [translationSourceSet.taskId],
		references: [task.id],
	}),
	attempts: many(translationAttempt),
}));

export const translationAttemptRelations = relations(translationAttempt, ({ one, many }) => ({
	user: one(user, {
		fields: [translationAttempt.userId],
		references: [user.id],
	}),
	task: one(task, {
		fields: [translationAttempt.taskId],
		references: [task.id],
	}),
	lineup: one(lineup, {
		fields: [translationAttempt.lineupId],
		references: [lineup.id],
	}),
	sourceSet: one(translationSourceSet, {
		fields: [translationAttempt.sourceSetId],
		references: [translationSourceSet.id],
	}),
	answers: many(translationAnswer),
	notes: many(note),
}));

export const translationAnswerRelations = relations(translationAnswer, ({ one }) => ({
	attempt: one(translationAttempt, {
		fields: [translationAnswer.attemptId],
		references: [translationAttempt.id],
	}),
}));

export const practiceSessionRelations = relations(practiceSession, ({ one, many }) => ({
	user: one(user, {
		fields: [practiceSession.userId],
		references: [user.id],
	}),
	task: one(task, {
		fields: [practiceSession.taskId],
		references: [task.id],
	}),
	lineup: one(lineup, {
		fields: [practiceSession.lineupId],
		references: [lineup.id],
	}),
	messages: many(sessionMessage),
	responseBatches: many(agentResponseBatch),
	notes: many(note),
}));

export const sessionMessageRelations = relations(sessionMessage, ({ one }) => ({
	session: one(practiceSession, {
		fields: [sessionMessage.sessionId],
		references: [practiceSession.id],
	}),
	responseBatch: one(agentResponseBatch, {
		fields: [sessionMessage.responseBatchId],
		references: [agentResponseBatch.id],
	}),
	delivery: one(agentDelivery, {
		fields: [sessionMessage.deliveryId],
		references: [agentDelivery.id],
	}),
}));

export const agentResponseBatchRelations = relations(agentResponseBatch, ({ one, many }) => ({
	session: one(practiceSession, {
		fields: [agentResponseBatch.sessionId],
		references: [practiceSession.id],
	}),
	deliveries: many(agentDelivery),
	messages: many(sessionMessage),
}));

export const agentDeliveryRelations = relations(agentDelivery, ({ one }) => ({
	batch: one(agentResponseBatch, {
		fields: [agentDelivery.batchId],
		references: [agentResponseBatch.id],
	}),
	message: one(sessionMessage),
}));

export const noteRelations = relations(note, ({ one, many }) => ({
	user: one(user, { fields: [note.userId], references: [user.id] }),
	sourceSession: one(practiceSession, { fields: [note.sourceSessionId], references: [practiceSession.id] }),
	sourceTranslationAttempt: one(translationAttempt, {
		fields: [note.sourceTranslationAttemptId],
		references: [translationAttempt.id],
	}),
	reviewLogs: many(reviewLog),
}));

export const reviewLogRelations = relations(reviewLog, ({ one }) => ({
	note: one(note, { fields: [reviewLog.noteId], references: [note.id] }),
	user: one(user, { fields: [reviewLog.userId], references: [user.id] }),
}));

export * from "./auth.schema";
// Re-export
export * from "./enums";
