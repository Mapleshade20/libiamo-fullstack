import { relations, sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { TranslationWorkflowPhase } from "$lib/constants";
import type { ChatMessage } from "$lib/server/llm";
import type { Generation1Evaluation } from "$lib/server/translation-evaluation/schema";
import type { TranslationCardWarning } from "$lib/translation-evaluation/types";
import { user } from "./auth.schema";
import {
	agentDeliveryStatusEnum,
	agentResponseBatchKindEnum,
	agentResponseBatchStatusEnum,
	cadenceEnum,
	interactionTypeEnum,
	languageCodeEnum,
	messageRoleEnum,
	scheduleOriginEnum,
	sessionCompletionReasonEnum,
	sessionStatusEnum,
	uiVariantEnum,
	urgencyEnum,
} from "./enums";

// ── userLearningProfile ──────────────────────────────────────────────
export const userLearningProfile = pgTable(
	"user_learning_profile",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		language: languageCodeEnum("language").notNull(),
		levelSelfAssign: integer("level_self_assign").default(2).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.language] }), check("level_check", sql`${t.levelSelfAssign} >= 1 AND ${t.levelSelfAssign} <= 3`)],
);

// ── template ─────────────────────────────────────────────────────────
export const template = pgTable(
	"template",
	{
		id: serial("id").primaryKey(),
		isActive: boolean("is_active").default(true).notNull(),
		urgency: urgencyEnum("urgency"),
		language: languageCodeEnum("language").notNull(),
		interactionType: interactionTypeEnum("interaction_type").notNull(),
		ui: uiVariantEnum("ui").notNull(),
		cadence: cadenceEnum("cadence").notNull(),

		titleBase: text("title_base").notNull(),
		shortObjectiveBase: text("short_objective_base"),
		descriptionBase: text("description_base"),
		objectivesBase: text("objectives_base").array(),
		agentPromptBase: text("agent_prompt_base"),
		materialsMd: text("materials_md"),
		translationReference: jsonb("translation_reference").$type<string[]>(),
		tags: text("tags").array(),

		maxTurns: integer("max_turns"),
		estimatedWords: integer("estimated_words"),
		difficulty: integer("difficulty").notNull(),
		pointReward: integer("point_reward").notNull(),
		gemReward: integer("gem_reward").notNull(),

		createdBy: text("created_by").references(() => user.id),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [
		uniqueIndex("template_id_language_idx").on(t.id, t.language),
		check("difficulty_check", sql`${t.difficulty} >= 1 AND ${t.difficulty} <= 3`),
		check(
			"template_urgency_check",
			sql`(${t.interactionType} = 'translate' AND ${t.urgency} IS NULL) OR (${t.interactionType} = 'chat' AND ${t.urgency} IS NOT NULL)`,
		),
	],
);

// ── templateContribution ──────────────────────────────────────────────
export const templateContribution = pgTable("template_contribution", {
	id: serial("id").primaryKey(),
	language: languageCodeEnum("language").notNull(),
	interactionType: interactionTypeEnum("interaction_type").notNull(),
	ui: uiVariantEnum("ui").notNull(),
	cadence: cadenceEnum("cadence"),
	urgency: urgencyEnum("urgency"),

	titleBase: text("title_base").notNull(),
	shortObjectiveBase: text("short_objective_base"),
	descriptionBase: text("description_base"),
	objectivesBase: text("objectives_base").array(),
	agentPromptBase: text("agent_prompt_base"),
	materialsMd: text("materials_md"),
	translationReference: jsonb("translation_reference").$type<string[]>(),
	tags: text("tags").array(),

	slotValues: jsonb("slot_values").notNull().default({}),
	openingState: jsonb("opening_state").notNull().default({}),

	difficulty: integer("difficulty"),

	status: text("status", { enum: ["approved", "pending", "rejected"] })
		.$type<"approved" | "pending" | "rejected">()
		.default("pending")
		.notNull(),
	createdBy: text("created_by")
		.notNull()
		.references(() => user.id),
	reviewedBy: text("reviewed_by").references(() => user.id),
	reviewNotes: text("review_notes"),
	submittedAt: timestamp("submitted_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

// ── templateVariant ───────────────────────────────────────────────────
export const templateVariant = pgTable(
	"template_variant",
	{
		id: serial("id").primaryKey(),
		templateId: integer("template_id")
			.notNull()
			.references(() => template.id, { onDelete: "cascade" }),
		isActive: boolean("is_active").default(true).notNull(),
		slotValues: jsonb("slot_values").notNull().default({}),
		openingState: jsonb("opening_state").notNull().default({}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [index("template_variant_template_id_idx").on(t.templateId)],
);

// ── task ─────────────────────────────────────────────────────────────
export const task = pgTable(
	"task",
	{
		id: serial("id").primaryKey(),
		templateId: integer("template_id")
			.notNull()
			.references(() => template.id),
		variantId: integer("variant_id")
			.notNull()
			.references(() => templateVariant.id),
		language: languageCodeEnum("language").notNull(),
		cadence: cadenceEnum("cadence").notNull(),
		date: date("date").notNull(),
		origin: scheduleOriginEnum("origin").notNull(),
		urgency: urgencyEnum("urgency").notNull(),
		maxSessionAgeSeconds: integer("max_session_age_seconds").notNull(),

		title: text("title").notNull(),
		shortObjective: text("short_objective"),
		description: text("description"),
		objectives: text("objectives").array(),
		agentPrompt: text("agent_prompt"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("task_date_template_idx").on(t.date, t.templateId),
		index("task_language_date_idx").on(t.language, t.date),
		index("task_language_cadence_date_idx").on(t.language, t.cadence, t.date),
	],
);

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
			.references(() => task.id, { onDelete: "cascade" }),
		agentPromptSnapshot: jsonb("agent_prompt_snapshot").notNull(),
		urgency: urgencyEnum("urgency").notNull(),
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
	},
	(t) => [
		uniqueIndex("practice_session_user_task_idx").on(t.userId, t.taskId),
		index("practice_session_archive_idx").on(t.userId, t.status, t.completedAt),
		index("practice_session_expiry_idx").on(t.status, t.expiresAt),
		check("practice_session_follow_up_count_check", sql`${t.followUpCount} >= 0 AND ${t.followUpCount} <= 2`),
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
	(t) => [index("session_message_session_idx").on(t.sessionId), uniqueIndex("session_message_delivery_idx").on(t.deliveryId)],
);

// ── translationSourceSet ────────────────────────────────────────────
export const translationSourceSet = pgTable(
	"translation_source_set",
	{
		id: serial("id").primaryKey(),
		templateId: integer("template_id")
			.notNull()
			.references(() => template.id),
		sourceLanguage: text("source_language").notNull(),
		promptLanguage: text("prompt_language").notNull(),
		referenceParagraphs: jsonb("reference_paragraphs").$type<string[]>().notNull(),
		context: text("context").notNull(),
		contentFingerprint: text("content_fingerprint").notNull(),
		candidates: jsonb("candidates").$type<string[][]>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		uniqueIndex("translation_source_set_template_prompt_fingerprint_idx").on(t.templateId, t.promptLanguage, t.contentFingerprint),
		index("translation_source_set_template_idx").on(t.templateId),
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
		sourceSetId: integer("source_set_id")
			.notNull()
			.references(() => translationSourceSet.id),
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
		uniqueIndex("translation_attempt_active_user_source_set_idx").on(t.userId, t.sourceSetId).where(sql`${t.workflowPhase} <> 'completed'`),
		index("translation_attempt_user_idx").on(t.userId),
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
export const userLearningProfileRelations = relations(userLearningProfile, ({ one }) => ({
	user: one(user, {
		fields: [userLearningProfile.userId],
		references: [user.id],
	}),
}));

export const templateRelations = relations(template, ({ one, many }) => ({
	createdByUser: one(user, {
		fields: [template.createdBy],
		references: [user.id],
	}),
	tasks: many(task),
	variants: many(templateVariant),
	translationSourceSets: many(translationSourceSet),
}));

export const templateVariantRelations = relations(templateVariant, ({ one, many }) => ({
	template: one(template, {
		fields: [templateVariant.templateId],
		references: [template.id],
	}),
	tasks: many(task),
}));

export const templateContributionRelations = relations(templateContribution, ({ one }) => ({
	createdByUser: one(user, {
		fields: [templateContribution.createdBy],
		references: [user.id],
		relationName: "contributionCreatedBy",
	}),
	reviewedByUser: one(user, {
		fields: [templateContribution.reviewedBy],
		references: [user.id],
		relationName: "contributionReviewedBy",
	}),
}));

export const translationSourceSetRelations = relations(translationSourceSet, ({ one, many }) => ({
	template: one(template, {
		fields: [translationSourceSet.templateId],
		references: [template.id],
	}),
	attempts: many(translationAttempt),
}));

export const translationAttemptRelations = relations(translationAttempt, ({ one, many }) => ({
	user: one(user, {
		fields: [translationAttempt.userId],
		references: [user.id],
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

export const taskRelations = relations(task, ({ one }) => ({
	template: one(template, {
		fields: [task.templateId],
		references: [template.id],
	}),
	variant: one(templateVariant, {
		fields: [task.variantId],
		references: [templateVariant.id],
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
