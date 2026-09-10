import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { DEFAULT_SELF_ASSIGNED_LEVELS, type SelfAssignedLevelsByLanguage } from "$lib/constants";
import { languageCodeEnum, userRoleEnum } from "./enums";

export const user = pgTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").default(false).notNull(),
		image: text("image"),
		role: userRoleEnum("role").default("learner").notNull(),
		nativeLanguage: text("native_language"),
		feedbackLanguagePreference: text("feedback_language_preference").$type<"native" | "target">().default("native").notNull(),
		gemsBalance: integer("gems_balance").default(0).notNull(),
		activeLanguage: languageCodeEnum("active_language").notNull(),
		levelSelfAssign: jsonb("level_self_assign").$type<SelfAssignedLevelsByLanguage>().default(DEFAULT_SELF_ASSIGNED_LEVELS).notNull(),
		deletedAt: timestamp("deleted_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		check("user_feedback_language_preference_check", sql`${t.feedbackLanguagePreference} IN ('native', 'target')`),
		check(
			"user_level_self_assign_check",
			sql`
				jsonb_typeof(${t.levelSelfAssign}) = 'object'
				AND ${t.levelSelfAssign} ?& ARRAY['en', 'es', 'fr', 'ja']
				AND (${t.levelSelfAssign} - 'en' - 'es' - 'fr' - 'ja') = '{}'::jsonb
				AND (${t.levelSelfAssign}->'en') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
				AND (${t.levelSelfAssign}->'es') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
				AND (${t.levelSelfAssign}->'fr') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
				AND (${t.levelSelfAssign}->'ja') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
			`,
		),
	],
);

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at"),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userApiKey = pgTable("user_api_key", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	encryptedKey: text("encrypted_key").notNull(),
	baseUrl: text("base_url").notNull(),
	model: text("model").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const userQuota = pgTable(
	"user_quota",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		trialTokensLeft: integer("trial_tokens_left").notNull(),
		trialTokensTotal: integer("trial_tokens_total").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(t) => [
		check("user_quota_trial_tokens_left_non_negative", sql`${t.trialTokensLeft} >= 0`),
		check("user_quota_trial_tokens_total_positive", sql`${t.trialTokensTotal} > 0`),
	],
);

export const userRelations = relations(user, ({ many, one }) => ({
	sessions: many(session),
	accounts: many(account),
	apiKey: one(userApiKey),
	quota: one(userQuota),
}));

export const userApiKeyRelations = relations(userApiKey, ({ one }) => ({
	user: one(user, {
		fields: [userApiKey.userId],
		references: [user.id],
	}),
}));

export const userQuotaRelations = relations(userQuota, ({ one }) => ({
	user: one(user, {
		fields: [userQuota.userId],
		references: [user.id],
	}),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));
