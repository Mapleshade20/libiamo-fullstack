/*
 * The database. Value sets are text with a check built from lib/constants.ts (they will change; enums would need a
 * migration each time), every time is timestamptz, and jsonb is validated in code on every write. Design:
 * docs/design/2026-11-13-step-3-rebuild.md §5.
 */
import { type SQL, sql } from "drizzle-orm";
import { boolean, check, index, integer, type PgColumn, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { APP_LANGS, KEY_PROVIDERS, LEARNABLE, ROLES, TUTOR_LANGUAGES } from "#lib/constants.ts";

const at = (name: string) => timestamp(name, { withTimezone: true });
const created = () => at("created_at").defaultNow().notNull();
const updated = () =>
	at("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull();

/** A literal list for DDL, where parameters cannot go. */
const list = (values: readonly string[]) => sql.raw(values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", "));
const oneOf = (column: PgColumn, values: readonly string[]): SQL => sql`${column} in (${list(values)})`;

// --- Account (§5.1) ---------------------------------------------------------------------------------------------------

/* Better Auth's user, with the learner's settings. A new account has no languages until the welcome sets them
   (`onboarded_at`). `image` is Better Auth's and never used: pictures are Gravatar's. */
export const user = pgTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: boolean("email_verified").default(false).notNull(),
		image: text("image"),
		role: text("role").default("learner").notNull(),
		nativeLanguage: text("native_language"),
		learningLanguages: text("learning_languages").array().default(sql`'{}'::text[]`).notNull(),
		activeLanguage: text("active_language"),
		tutorLanguage: text("tutor_language").default("native").notNull(),
		weeklyGoal: integer("weekly_goal").default(3).notNull(),
		timeZone: text("time_zone"),
		helpImprove: boolean("help_improve").default(true).notNull(),
		onboardedAt: at("onboarded_at"),
		/** The address a change is waiting on until its link is opened (Better Auth keeps none). */
		pendingEmail: text("pending_email"),
		deletedAt: at("deleted_at"),
		createdAt: created(),
		updatedAt: updated(),
	},
	(t) => [
		check("user_role_check", oneOf(t.role, ROLES)),
		check("user_native_language_check", sql`${t.nativeLanguage} is null or ${oneOf(t.nativeLanguage, APP_LANGS)}`),
		check("user_learning_languages_check", sql`${t.learningLanguages} <@ array[${list(LEARNABLE)}]::text[]`),
		check("user_active_language_check", sql`${t.activeLanguage} is null or ${t.activeLanguage} = any(${t.learningLanguages})`),
		check("user_tutor_language_check", oneOf(t.tutorLanguage, TUTOR_LANGUAGES)),
		check("user_weekly_goal_check", sql`${t.weeklyGoal} between 1 and 7`),
		check("user_onboarded_check", sql`${t.onboardedAt} is null or (${t.nativeLanguage} is not null and ${t.activeLanguage} is not null)`),
	],
);

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		token: text("token").notNull().unique(),
		expiresAt: at("expires_at").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		createdAt: created(),
		updatedAt: updated(),
	},
	(t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: at("access_token_expires_at"),
		refreshTokenExpiresAt: at("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: created(),
		updatedAt: updated(),
	},
	(t) => [
		uniqueIndex("account_provider_account_unique").on(t.providerId, t.accountId),
		uniqueIndex("account_user_provider_unique").on(t.userId, t.providerId),
	],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: at("expires_at").notNull(),
		createdAt: created(),
		updatedAt: updated(),
	},
	(t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** The learner's own key (AES-GCM), the only one their calls use. */
export const userKey = pgTable(
	"user_key",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => user.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		encryptedKey: text("encrypted_key").notNull(),
		createdAt: created(),
		updatedAt: updated(),
	},
	(t) => [check("user_key_provider_check", oneOf(t.provider, KEY_PROVIDERS))],
);
