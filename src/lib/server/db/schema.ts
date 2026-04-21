import { relations, sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { cadenceEnum, interactionTypeEnum, languageCodeEnum, scheduleOriginEnum, uiVariantEnum } from "./enums";

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
		tags: text("tags").array().default(sql`'{}'`).notNull(),

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
		slotValues: jsonb("slot_values").notNull().default(sql`'{}'`),
		openingState: jsonb("opening_state").notNull().default(sql`'{}'`),
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

export * from "./auth.schema";
// Re-export
export * from "./enums";
