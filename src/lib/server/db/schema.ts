import { relations, sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { cadenceEnum, interactionTypeEnum, languageCodeEnum, messageRoleEnum, scheduleOriginEnum, sessionStatusEnum, uiVariantEnum } from "./enums";

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
		agentStartsFirst: boolean("agent_starts_first").default(true).notNull(),
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
	],
);

// ── templateContribution ──────────────────────────────────────────────
export const templateContribution = pgTable("template_contribution", {
	id: serial("id").primaryKey(),
	language: languageCodeEnum("language").notNull(),
	interactionType: interactionTypeEnum("interaction_type").notNull(),
	ui: uiVariantEnum("ui").notNull(),
	cadence: cadenceEnum("cadence"),
	agentStartsFirst: boolean("agent_starts_first"),

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
		status: sessionStatusEnum("status").default("in_progress").notNull(),
		tutorFeedback: jsonb("tutor_feedback"),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
	},
	(t) => [
		uniqueIndex("practice_session_user_task_idx").on(t.userId, t.taskId),
		index("practice_session_archive_idx").on(t.userId, t.status, t.completedAt),
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
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("session_message_session_idx").on(t.sessionId)],
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
		status: text("status").$type<"draft" | "submitted" | "evaluated">().notNull().default("draft"),
		evaluation: jsonb("evaluation").$type<{
			overallScore: "A" | "B" | "C";
			overallFeedback: string;
			paragraphs: { paragraphIndex: number; feedback: string; rewriteSuggestion: string }[];
		}>(),
		submittedAt: timestamp("submitted_at"),
		evaluatedAt: timestamp("evaluated_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [uniqueIndex("translation_attempt_user_source_set_idx").on(t.userId, t.sourceSetId), index("translation_attempt_user_idx").on(t.userId)],
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
		sourceSessionId: integer("source_session_id")
			.notNull()
			.references(() => practiceSession.id, { onDelete: "cascade" }),
		sourceMessageId: integer("source_message_id").references(() => sessionMessage.id, { onDelete: "set null" }),
		tutorComment: text("tutor_comment").notNull(),
		keywords: text("keywords").array(),
		sourceContext: text("source_context"),
		reviewStatus: text("review_status").$type<"pending" | "generated" | "skipped">(),
	},
	(t) => [index("note_user_id_idx").on(t.userId), index("note_source_session_id_idx").on(t.sourceSessionId)],
);

// ── reviewCard ──────────────────────────────────────────────────────
export const reviewCard = pgTable(
	"review_card",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		sourceNoteId: integer("source_note_id").references(() => note.id, { onDelete: "cascade" }),
		language: languageCodeEnum("language").notNull(),
		cardType: text("card_type").$type<"vocabulary" | "expression" | "grammar" | "correction">().notNull(),
		front: text("front").notNull(),
		back: text("back").notNull(),
		fsrsCard: jsonb("fsrs_card").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [index("review_card_user_lang_idx").on(t.userId, t.language), uniqueIndex("review_card_source_note_unique").on(t.sourceNoteId)],
);

// ── reviewLog ───────────────────────────────────────────────────────
export const reviewLog = pgTable(
	"review_log",
	{
		id: serial("id").primaryKey(),
		cardId: integer("card_id")
			.notNull()
			.references(() => reviewCard.id, { onDelete: "cascade" }),
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
	(t) => [index("review_log_card_idx").on(t.cardId), index("review_log_user_reviewed_idx").on(t.userId, t.reviewedAt)],
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
	notes: many(note),
}));

export const sessionMessageRelations = relations(sessionMessage, ({ one }) => ({
	session: one(practiceSession, {
		fields: [sessionMessage.sessionId],
		references: [practiceSession.id],
	}),
}));

export const noteRelations = relations(note, ({ one, many }) => ({
	user: one(user, { fields: [note.userId], references: [user.id] }),
	sourceSession: one(practiceSession, { fields: [note.sourceSessionId], references: [practiceSession.id] }),
	sourceMessage: one(sessionMessage, { fields: [note.sourceMessageId], references: [sessionMessage.id] }),
	reviewCards: many(reviewCard),
}));

export const reviewCardRelations = relations(reviewCard, ({ one, many }) => ({
	user: one(user, { fields: [reviewCard.userId], references: [user.id] }),
	sourceNote: one(note, { fields: [reviewCard.sourceNoteId], references: [note.id] }),
	reviewLogs: many(reviewLog),
}));

export const reviewLogRelations = relations(reviewLog, ({ one }) => ({
	card: one(reviewCard, { fields: [reviewLog.cardId], references: [reviewCard.id] }),
	user: one(user, { fields: [reviewLog.userId], references: [user.id] }),
}));

export * from "./auth.schema";
// Re-export
export * from "./enums";
