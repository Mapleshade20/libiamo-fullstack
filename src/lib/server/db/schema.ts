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
		translationBase: jsonb("translation_base").$type<string[][]>(),
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
			.references(() => user.id),
		taskId: integer("task_id")
			.notNull()
			.references(() => task.id),
		agentPromptSnapshot: jsonb("agent_prompt_snapshot").notNull(),
		status: sessionStatusEnum("status").default("in_progress").notNull(),
		tutorFeedback: jsonb("tutor_feedback"),
		startedAt: timestamp("started_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
	},
	(t) => [index("practice_session_user_task_idx").on(t.userId, t.taskId)],
);

// ── sessionMessage ─────────────────────────────────────────────────────
export const sessionMessage = pgTable(
	"session_message",
	{
		id: serial("id").primaryKey(),
		sessionId: integer("session_id")
			.notNull()
			.references(() => practiceSession.id),
		role: messageRoleEnum("role").notNull(),
		content: text("content").notNull(),
		llmMetadata: jsonb("llm_metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [index("session_message_session_idx").on(t.sessionId)],
);

// ── translationAttempt ──────────────────────────────────────────────
export const translationAttempt = pgTable(
	"translation_attempt",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		templateId: integer("template_id")
			.notNull()
			.references(() => template.id),
		translations: jsonb("translations").$type<Record<string, string>>().notNull().default({}),
		status: text("status").$type<"draft" | "submitted" | "evaluated">().notNull().default("draft"),
		evaluation: jsonb("evaluation").$type<{
			overallScore?: string;
			overallFeedback?: string;
			highlights?: { key: string; type: "good" | "bad"; feedback: string }[];
		}>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(t) => [index("translation_attempt_user_template_idx").on(t.userId, t.templateId)],
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
}));

export const templateVariantRelations = relations(templateVariant, ({ one, many }) => ({
	template: one(template, {
		fields: [templateVariant.templateId],
		references: [template.id],
	}),
	tasks: many(task),
}));

export const translationAttemptRelations = relations(translationAttempt, ({ one }) => ({
	user: one(user, {
		fields: [translationAttempt.userId],
		references: [user.id],
	}),
	template: one(template, {
		fields: [translationAttempt.templateId],
		references: [template.id],
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
}));

export const sessionMessageRelations = relations(sessionMessage, ({ one }) => ({
	session: one(practiceSession, {
		fields: [sessionMessage.sessionId],
		references: [practiceSession.id],
	}),
}));

export * from "./auth.schema";
// Re-export
export * from "./enums";
