/*
 * The database. Value sets are text with a check built from lib/constants.ts (they will change; enums would need a
 * migration each time), every time is timestamptz, and jsonb is validated in code on every write. Design:
 * docs/design/2026-11-13-step-3-rebuild.md §5.
 */
import { type SQL, sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	doublePrecision,
	index,
	integer,
	jsonb,
	type PgColumn,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import {
	APP_LANGS,
	CALL_STATES,
	DETAILS,
	KEY_PROVIDERS,
	LEARNABLE,
	NOTE_KINDS,
	PIECE_KINDS,
	PIECE_STATES,
	POSTED,
	REGISTERS,
	ROLES,
	TUTOR_LANGUAGES,
	VERDICTS,
} from "#lib/constants.ts";

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
   (`onboarded_at`). `image` is Better Auth's and never used: pictures are Gravatar's. Deleting an account deletes the
   row, and every table that belongs to a learner references it `on delete cascade`, so nothing of theirs stays. */
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

// --- The week (§5.2) --------------------------------------------------------------------------------------------------

/* A day of the learner's week, in their time zone: it counts when both halves are set. Each half is written only in the
   transaction that earned it (server/week/days.ts), never read-modified-written. */
export const practiceDay = pgTable(
	"practice_day",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		day: date("day").notNull(),
		learnedAt: at("learned_at"),
		reviewedAt: at("reviewed_at"),
	},
	(t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** The aim a week was held to (Monday first, in the learner's time zone): a goal changed later does not rewrite it. */
export const userWeek = pgTable(
	"user_week",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		weekStart: date("week_start").notNull(),
		goal: integer("goal").notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.weekStart] }), check("user_week_goal_check", sql`${t.goal} between 1 and 7`)],
);

// --- Pieces (§5.4) ----------------------------------------------------------------------------------------------------

/* One piece of the learner's writing, from the draft to what the revision left. `place` is where it is for as its
   cover names it (a scenario's place, or the site the scene inferred). `scenario_id` gains its reference with the
   scenario tables (phase 4). Only the guarded move to `finished` credits the day. */
export const piece = pgTable(
	"piece",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		language: text("language").notNull(),
		kind: text("kind").notNull(),
		scenarioId: text("scenario_id"),
		place: text("place").notNull().default(""),
		title: text("title").notNull().default(""),
		text: text("text").notNull(),
		background: text("background"),
		/** What the learner imported as context (a capture of the page, or any text). */
		context: text("context"),
		/** The language the tutor speaks in this piece (a code: the learner's own or the target). */
		tutorLanguage: text("tutor_language").notNull(),
		detail: text("detail").notNull().default("needed"),
		provider: text("provider"),
		model: text("model"),
		state: text("state").notNull().default("revising"),
		final: text("final"),
		closing: text("closing"),
		reader: text("reader"),
		leftovers: jsonb("leftovers"),
		authentic: text("authentic"),
		learned: jsonb("learned"),
		finishedAt: at("finished_at"),
		notesRequestedAt: at("notes_requested_at"),
		posted: text("posted"),
		askedAt: at("asked_at"),
		againText: text("again_text"),
		againAt: at("again_at"),
		/** The commit that ran the revision, for reading a case against the code that made it. */
		sha: text("sha"),
		createdAt: created(),
		updatedAt: updated(),
	},
	(t) => [
		check("piece_language_check", oneOf(t.language, LEARNABLE)),
		check("piece_kind_check", oneOf(t.kind, PIECE_KINDS)),
		check("piece_detail_check", oneOf(t.detail, DETAILS)),
		check("piece_state_check", oneOf(t.state, PIECE_STATES)),
		check("piece_posted_check", sql`${t.posted} is null or ${oneOf(t.posted, POSTED)}`),
		check("piece_finished_check", sql`(${t.state} = 'finished') = (${t.finishedAt} is not null)`),
		index("piece_user_idx").on(t.userId, t.language, t.updatedAt),
		uniqueIndex("piece_open_scenario_unique")
			.on(t.userId, t.scenarioId)
			.where(sql`${t.scenarioId} is not null and ${t.state} in ('writing', 'revising')`),
	],
);

/** The revision's snapshot (server/revision/store.ts), apart from `piece` so lists never read it. */
export const pieceRevision = pgTable("piece_revision", {
	pieceId: uuid("piece_id")
		.primaryKey()
		.references(() => piece.id, { onDelete: "cascade" }),
	version: integer("version").notNull(),
	state: jsonb("state").notNull(),
	updatedAt: updated(),
});

/** The tape: every action the page sent in the revision, and what it got back. */
export const pieceStep = pgTable(
	"piece_step",
	{
		pieceId: uuid("piece_id")
			.notNull()
			.references(() => piece.id, { onDelete: "cascade" }),
		seq: integer("seq").notNull(),
		action: text("action").notNull(),
		body: jsonb("body"),
		response: jsonb("response"),
		error: text("error"),
		ms: integer("ms"),
		at: at("at").defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.pieceId, t.seq] })],
);

// --- Notebook and review (§5.6) -------------------------------------------------------------------------------------

/** Something the learner read and collected phrases from (the passage pasted on /collect, a scenario's situation). */
export const reading = pgTable(
	"reading",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		language: text("language").notNull(),
		text: text("text").notNull(),
		place: text("place"),
		createdAt: created(),
	},
	(t) => [check("reading_language_check", oneOf(t.language, LEARNABLE)), index("reading_user_idx").on(t.userId)],
);

/*
 * A notebook entry, and its review card. Own: a phrase worked out in a finished piece (`sentence` is the sentence as they
 * settled it, `was` what they first wrote there). Collected: a phrase highlighted in a reading (`sentence` is the
 * sentence it was read in, `marked` the words highlighted). `fsrs` is the scheduler's card (server/review/scheduler.ts);
 * `due` repeats its due time so the queue is an index scan. Deleting keeps the row for its review history.
 */
export const note = pgTable(
	"note",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		language: text("language").notNull(),
		kind: text("kind").notNull(),
		pieceId: uuid("piece_id").references(() => piece.id, { onDelete: "set null" }),
		readingId: uuid("reading_id").references(() => reading.id, { onDelete: "set null" }),
		phrase: text("phrase").notNull(),
		meaning: text("meaning").notNull().default(""),
		/** The language `meaning`, `usage`, `why` and the examples' translations are in (the tutor's, when it was written). */
		meaningLanguage: text("meaning_language").notNull(),
		usage: text("usage"),
		register: text("register"),
		why: text("why"),
		examples: jsonb("examples").notNull().default(sql`'[]'::jsonb`),
		sentence: text("sentence"),
		marked: text("marked"),
		was: text("was"),
		also: text("also").array().default(sql`'{}'::text[]`).notNull(),
		fsrs: jsonb("fsrs").notNull(),
		due: at("due").notNull(),
		deletedAt: at("deleted_at"),
		createdAt: created(),
		updatedAt: updated(),
	},
	(t) => [
		check("note_language_check", oneOf(t.language, LEARNABLE)),
		check("note_kind_check", oneOf(t.kind, NOTE_KINDS)),
		check("note_register_check", sql`${t.register} is null or ${oneOf(t.register, REGISTERS)}`),
		index("note_due_idx").on(t.userId, t.due).where(sql`${t.deletedAt} is null`),
		index("note_piece_idx").on(t.pieceId),
	],
);

/** Every rating, with the card before and after it. */
export const reviewLog = pgTable(
	"review_log",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		noteId: uuid("note_id")
			.notNull()
			.references(() => note.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		rating: integer("rating").notNull(),
		verdict: text("verdict"),
		elapsedSeconds: integer("elapsed_seconds").notNull(),
		prev: jsonb("prev").notNull(),
		next: jsonb("next").notNull(),
		reviewedAt: at("reviewed_at").defaultNow().notNull(),
	},
	(t) => [
		check("review_log_rating_check", sql`${t.rating} between 1 and 4`),
		check("review_log_verdict_check", sql`${t.verdict} is null or ${oneOf(t.verdict, VERDICTS)}`),
		index("review_log_note_idx").on(t.noteId),
	],
);

// --- Calls (§5.7) -----------------------------------------------------------------------------------------------------

/* Every model call, written after the fact. The numbers always; `messages` and `output` only while the learner helps
   improve Libiamo. A call on the environment's key (the gate) has no piece and may have no learner. */
export const llmCall = pgTable(
	"llm_call",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		pieceId: uuid("piece_id").references(() => piece.id, { onDelete: "cascade" }),
		stepSeq: integer("step_seq"),
		purpose: text("purpose").notNull(),
		tag: text("tag").notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		effort: text("effort"),
		state: text("state").notNull(),
		background: boolean("background").default(false).notNull(),
		/** The system prompt, stored once in `llm_prompt`. */
		promptHash: text("prompt_hash"),
		messages: jsonb("messages"),
		output: text("output"),
		error: text("error"),
		promptTokens: integer("prompt_tokens"),
		completionTokens: integer("completion_tokens"),
		reasoningTokens: integer("reasoning_tokens"),
		cacheRead: integer("cache_read"),
		cacheWrite: integer("cache_write"),
		costUsd: doublePrecision("cost_usd"),
		latencyMs: integer("latency_ms"),
		createdAt: created(),
	},
	(t) => [
		check("llm_call_state_check", oneOf(t.state, CALL_STATES)),
		index("llm_call_piece_idx").on(t.pieceId),
		index("llm_call_created_idx").on(t.createdAt),
	],
);

export const llmPrompt = pgTable("llm_prompt", {
	hash: text("hash").primaryKey(),
	text: text("text").notNull(),
});
