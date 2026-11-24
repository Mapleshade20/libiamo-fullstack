/*
 * The database. Value sets are text with a check built from lib/constants.ts (they will change; enums would need a
 * migration each time), every time is timestamptz, and jsonb is validated in code on every write. Design:
 * docs/design/2026-11-13-step-3-rebuild.md §5.
 */
import { relations, type SQL, sql } from "drizzle-orm";
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
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import {
	AGENT_BATCH_KINDS,
	AGENT_BATCH_STATUSES,
	AGENT_DELIVERY_STATUSES,
	APP_LANGS,
	BACKDROPS,
	CALL_STATES,
	CASE_STATUSES,
	DETAILS,
	EXCHANGE_END_REASONS,
	EXCHANGE_STATUSES,
	FEEDBACK_KINDS,
	KEY_PROVIDERS,
	LEARNABLE,
	MESSAGE_ROLES,
	NAME_KINDS,
	NAME_STATUSES,
	NOTE_KINDS,
	PATTERN_NAMES,
	PIECE_KINDS,
	PIECE_STATES,
	PLACES,
	POSTED,
	REGISTERS,
	ROLES,
	SCENARIO_KINDS,
	SCENARIO_STATUSES,
	SOURCE_STATES,
	SUGGESTION_PLACES,
	SUGGESTION_STATUSES,
	THEMES,
	TUTOR_LANGUAGES,
	URGENCIES,
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
		theme: text("theme").default("system").notNull(),
		backdrop: text("backdrop").default("none").notNull(),
		pattern: text("pattern").default("blossom").notNull(),
		detail: text("detail").default("needed").notNull(),
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
		check("user_theme_check", oneOf(t.theme, THEMES)),
		check("user_backdrop_check", oneOf(t.backdrop, BACKDROPS)),
		check("user_pattern_check", oneOf(t.pattern, PATTERN_NAMES)),
		check("user_detail_check", oneOf(t.detail, DETAILS)),
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
		/** The model the gate's questions go to, when the provider has a Decisions API; null is its default. */
		decisionModel: text("decision_model"),
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

// --- Scenarios (§5.3) -------------------------------------------------------------------------------------------------

/* A scenario: what is the same in every language. What learners read is in `versions`, keyed by the language learnt
   (lib/scenario/versions.ts validates it on every write); a language is offered when its version is there and not a
   draft. A translation's text comes from `scenario_source`, one per learner language. */
export const scenario = pgTable(
	"scenario",
	{
		id: text("id").primaryKey(),
		kind: text("kind").notNull(),
		place: text("place").notNull(),
		status: text("status").notNull().default("draft"),
		minutes: integer("minutes").notNull(),
		urgency: text("urgency"),
		/** Null: the exchange has no turn limit. */
		maxTurns: integer("max_turns"),
		/** A translation of a work with a name table: whose names it uses. */
		workId: text("work_id").references(() => work.id, { onDelete: "set null" }),
		versions: jsonb("versions").notNull(),
		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		publishedAt: at("published_at"),
		createdAt: created(),
		updatedAt: updated(),
	},
	(t) => [
		check("scenario_kind_check", oneOf(t.kind, SCENARIO_KINDS)),
		check("scenario_place_check", oneOf(t.place, PLACES)),
		check("scenario_status_check", oneOf(t.status, SCENARIO_STATUSES)),
		check("scenario_urgency_check", sql`${t.urgency} is null or ${oneOf(t.urgency, URGENCIES)}`),
		check("scenario_kind_place_check", sql`(${t.kind} = 'translation') = (${t.place} = 'translation')`),
		check("scenario_minutes_check", sql`${t.minutes} > 0`),
		check("scenario_max_turns_check", sql`${t.maxTurns} is null or ${t.maxTurns} > 0`),
	],
);

/* A translation's source in one learner language: the text learners translate, made and checked at publish (§6.4) or
   confirmed by an admin, with the names and terms it gives. `input_hash` fingerprints the full version and work used to generate it. */
export const scenarioSource = pgTable(
	"scenario_source",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		scenarioId: text("scenario_id")
			.notNull()
			.references(() => scenario.id, { onDelete: "cascade" }),
		/** The version translated into. */
		language: text("language").notNull(),
		/** The learner language the source is written in. */
		native: text("native").notNull(),
		/** A short heading for it in the learner's language ("Autumn menu"). */
		title: text("title").notNull().default(""),
		text: text("text").notNull().default(""),
		glossary: jsonb("glossary").notNull().default([]),
		state: text("state").notNull().default("pending"),
		notes: jsonb("notes"),
		inputHash: text("input_hash"),
		generation: uuid("generation").notNull().default(sql`uuidv7()`),
		madeAt: at("made_at"),
	},
	(t) => [
		uniqueIndex("scenario_source_unique").on(t.scenarioId, t.language, t.native),
		check("scenario_source_state_check", oneOf(t.state, SOURCE_STATES)),
	],
);

/* A work whose names translations keep consistent (a fandom's books), and how each name is rendered in each locale. */
export const work = pgTable("work", {
	id: text("id").primaryKey(),
	title: text("title").notNull(),
	wikidata: text("wikidata"),
	wikis: jsonb("wikis"),
	manual: jsonb("manual"),
});
export const nameRendering = pgTable(
	"name_rendering",
	{
		workId: text("work_id")
			.notNull()
			.references(() => work.id, { onDelete: "cascade" }),
		locale: text("locale").notNull(),
		term: text("term").notNull(),
		kind: text("kind").notNull().default("name"),
		rendering: text("rendering").notNull().default(""),
		status: text("status").notNull().default("pending"),
		origin: text("origin"),
		url: text("url"),
		why: text("why"),
		candidates: jsonb("candidates"),
	},
	(t) => [
		primaryKey({ columns: [t.workId, t.locale, t.term] }),
		check("name_rendering_kind_check", oneOf(t.kind, NAME_KINDS)),
		check("name_rendering_status_check", oneOf(t.status, NAME_STATUSES)),
	],
);

/* An issue: a themed handful of scenarios published on a date (the library shows the latest while it is recent).
   `title` and `line` are keyed by interface language. */
export const issue = pgTable("issue", {
	id: text("id").primaryKey(),
	date: date("date").notNull(),
	title: jsonb("title").notNull(),
	line: jsonb("line").notNull(),
	tone: text("tone").notNull(),
	deep: text("deep").notNull(),
	createdAt: created(),
	updatedAt: updated(),
});
export const issueScenario = pgTable(
	"issue_scenario",
	{
		issueId: text("issue_id")
			.notNull()
			.references(() => issue.id, { onDelete: "cascade" }),
		scenarioId: text("scenario_id")
			.notNull()
			.references(() => scenario.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
	},
	(t) => [primaryKey({ columns: [t.issueId, t.scenarioId] })],
);

/* A situation a learner suggests for a scenario (the shelf's "+"): where it was, what happened (pasted text, a page
   capture, or their own words), whom they were writing to, what they wanted to do, what they wrote. The admin makes a
   draft scenario of it (`live`, with `scenario_id`; the learner sees it so once that scenario is published) or sets it
   aside with a reason the learner reads. */
export const suggestion = pgTable(
	"suggestion",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		place: text("place").notNull(),
		language: text("language").notNull(),
		situation: text("situation").notNull(),
		who: text("who"),
		purpose: text("purpose").notNull(),
		mine: text("mine"),
		status: text("status").notNull().default("pending"),
		reason: text("reason"),
		scenarioId: text("scenario_id").references(() => scenario.id, { onDelete: "set null" }),
		createdAt: created(),
		resolvedAt: at("resolved_at"),
	},
	(t) => [
		check("suggestion_place_check", oneOf(t.place, SUGGESTION_PLACES)),
		check("suggestion_status_check", oneOf(t.status, SUGGESTION_STATUSES)),
		index("suggestion_user_idx").on(t.userId, t.createdAt),
	],
);

/* Feedback about Libiamo itself, with the page and browser it came from. */
export const feedback = pgTable(
	"feedback",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		text: text("text").notNull(),
		page: text("page"),
		browser: text("browser"),
		createdAt: created(),
		doneAt: at("done_at"),
	},
	(t) => [check("feedback_kind_check", oneOf(t.kind, FEEDBACK_KINDS)), index("feedback_user_idx").on(t.userId)],
);

/* A notice for every learner above the greeting, written per interface language (`title`, `body` keyed by language),
   shown from `published_at` until `expires_at`; who has acknowledged it is `announcement_read`. */
export const announcement = pgTable("announcement", {
	id: serial("id").primaryKey(),
	title: jsonb("title").notNull(),
	body: jsonb("body").notNull(),
	publishedAt: at("published_at"),
	expiresAt: at("expires_at"),
	createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
	createdAt: created(),
});
export const announcementRead = pgTable(
	"announcement_read",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		announcementId: integer("announcement_id")
			.notNull()
			.references(() => announcement.id, { onDelete: "cascade" }),
		readAt: at("read_at").defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.announcementId] })],
);

// --- Pieces (§5.4) ----------------------------------------------------------------------------------------------------

/* One piece of the learner's writing, from the draft to what the revision left. `place` is where it is for as its
   cover names it (a scenario's place, or the site the scene inferred). A translation's piece pins the source it was
   written from. Only the guarded move to `finished` credits the day. */
export const piece = pgTable(
	"piece",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		language: text("language").notNull(),
		kind: text("kind").notNull(),
		scenarioId: text("scenario_id").references(() => scenario.id, { onDelete: "set null" }),
		sourceId: uuid("source_id").references(() => scenarioSource.id, { onDelete: "set null" }),
		/** The complete translation assignment when the learner first saved, not mutable content-table joins. */
		assignment: jsonb("assignment"),
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
		/** Since when its notebook entries are on their way, and how many times they have been asked for. */
		notesRequestedAt: at("notes_requested_at"),
		notesTries: integer("notes_tries").notNull().default(0),
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
		// A learner's pieces in a language, newest first (ids are uuidv7: their order is when each was made): the shelf,
		// My writing's pages, a scenario's progress.
		index("piece_user_idx").on(t.userId, t.language, t.id),
		// Who has written in a scenario (its written count, whether where it happens is fixed).
		index("piece_scenario_idx").on(t.scenarioId).where(sql`${t.scenarioId} is not null`),
		index("piece_notes_retry_idx").on(t.notesRequestedAt).where(sql`${t.notesRequestedAt} is not null`),
		// One unfinished piece of a scenario per language: each language is written on its own.
		uniqueIndex("piece_open_scenario_unique")
			.on(t.userId, t.scenarioId, t.language)
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

// --- The exchange (§5.5) ----------------------------------------------------------------------------------------------

/* A scenario's simulated conversation, one per scenario piece: the learner's messages and the cast's replies, composed
   in the background by the agent worker (server/exchange/agents) in batches and paced out as deliveries. The floor, the
   lock order, the claim leases and the comment-id scheme are the old practice session's (design §5.5). */
export const exchange = pgTable(
	"exchange",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		pieceId: uuid("piece_id")
			.notNull()
			.unique()
			.references(() => piece.id, { onDelete: "cascade" }),
		scenarioId: text("scenario_id").references(() => scenario.id, { onDelete: "set null" }),
		expiresAt: at("expires_at").notNull(),
		status: text("status").notNull().default("in_progress"),
		completionReason: text("completion_reason"),
		lastSeenAssistantMessageId: integer("last_seen_assistant_message_id"),
		agentReadUpToMessageId: integer("agent_read_up_to_message_id"),
		followUpCount: integer("follow_up_count").notNull().default(0),
		startedAt: at("started_at").defaultNow().notNull(),
		completedAt: at("completed_at"),
	},
	(t) => [
		index("exchange_user_idx").on(t.userId),
		index("exchange_expiry_idx").on(t.status, t.expiresAt),
		check("exchange_status_check", oneOf(t.status, EXCHANGE_STATUSES)),
		check("exchange_completion_reason_check", sql`${t.completionReason} is null or ${oneOf(t.completionReason, EXCHANGE_END_REASONS)}`),
		check("exchange_follow_up_count_check", sql`${t.followUpCount} between 0 and 6`),
	],
);

/* A batch of agent work: one opportunity to answer (or to speak up), claimed by a worker under a lease, composed by one
   model call, then paced out as deliveries. */
export const agentBatch = pgTable(
	"agent_batch",
	{
		id: serial("id").primaryKey(),
		exchangeId: integer("exchange_id")
			.notNull()
			.references(() => exchange.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		status: text("status").notNull().default("pending"),
		dueAt: at("due_at").notNull(),
		inputMessageId: integer("input_message_id"),
		inputVersion: integer("input_version").notNull().default(0),
		/** The comment ref of the message this conversation serves; null for world moments and non-threaded places. */
		targetRef: text("target_ref"),
		/** The cast member who takes up this opportunity; written at creation, never redrawn. */
		participant: text("participant"),
		/** The attempt number of the input message this batch serves (settlement scopes siblings by it). */
		attempt: integer("attempt").notNull().default(0),
		workerId: text("worker_id"),
		claimToken: text("claim_token"),
		claimedAt: at("claimed_at"),
		leaseExpiresAt: at("lease_expires_at"),
		generationCount: integer("generation_count").notNull().default(0),
		staleCount: integer("stale_count").notNull().default(0),
		/** The decision the turn came back with (no prompt or raw reply: the call's record keeps those, server/llm/records.ts). */
		parsedResult: jsonb("parsed_result"),
		error: text("error"),
		allowIdleFollowUp: boolean("allow_idle_follow_up"),
		createdAt: created(),
		completedAt: at("completed_at"),
	},
	(t) => [
		index("agent_batch_status_due_idx").on(t.status, t.dueAt),
		index("agent_batch_exchange_status_idx").on(t.exchangeId, t.status),
		check("agent_batch_kind_check", oneOf(t.kind, AGENT_BATCH_KINDS)),
		check("agent_batch_status_check", oneOf(t.status, AGENT_BATCH_STATUSES)),
		check("agent_batch_counts_check", sql`${t.inputVersion} >= 0 and ${t.generationCount} >= 0 and ${t.staleCount} >= 0`),
		// At most one outstanding world batch per exchange.
		uniqueIndex("agent_batch_world_outstanding_idx")
			.on(t.exchangeId)
			.where(sql`${t.kind} = 'world' and ${t.status} in ('pending', 'processing', 'stale', 'delivery_pending')`),
	],
);

/* One message of a batch, paced out at its own due time. */
export const agentDelivery = pgTable(
	"agent_delivery",
	{
		id: serial("id").primaryKey(),
		batchId: integer("batch_id")
			.notNull()
			.references(() => agentBatch.id, { onDelete: "cascade" }),
		sequence: integer("sequence").notNull(),
		content: text("content").notNull(),
		/** The cast member who posts it. */
		author: text("author"),
		/** A scene message ref, or `@n` for the n-th delivery of the same batch. */
		replyTo: text("reply_to"),
		status: text("status").notNull().default("pending"),
		dueAt: at("due_at").notNull(),
		deliveredAt: at("delivered_at"),
		createdAt: created(),
	},
	(t) => [
		uniqueIndex("agent_delivery_batch_sequence_idx").on(t.batchId, t.sequence),
		index("agent_delivery_status_due_idx").on(t.status, t.dueAt),
		check("agent_delivery_sequence_check", sql`${t.sequence} >= 0`),
		check("agent_delivery_status_check", oneOf(t.status, AGENT_DELIVERY_STATUSES)),
	],
);

/* What was said in the exchange: the learner's messages and the deliveries once they land. `llm_metadata` holds the
   message's place-specific facts (client id, thread position, author, the message it quotes). */
export const exchangeMessage = pgTable(
	"exchange_message",
	{
		id: serial("id").primaryKey(),
		exchangeId: integer("exchange_id")
			.notNull()
			.references(() => exchange.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		content: text("content").notNull(),
		llmMetadata: jsonb("llm_metadata"),
		responseBatchId: integer("response_batch_id").references(() => agentBatch.id, { onDelete: "set null" }),
		deliveryId: integer("delivery_id").references(() => agentDelivery.id, { onDelete: "set null" }),
		createdAt: created(),
	},
	(t) => [
		index("exchange_message_exchange_idx").on(t.exchangeId),
		// Deleting an account deletes its batches, which set this to null.
		index("exchange_message_response_batch_idx").on(t.responseBatchId),
		uniqueIndex("exchange_message_delivery_idx").on(t.deliveryId),
		// Unread counts scan only replies past each exchange's watermark (server/exchange/unread.ts).
		index("exchange_message_unread_idx").on(t.exchangeId, t.id).where(sql`${t.role} = 'assistant'`),
		check("exchange_message_role_check", oneOf(t.role, MESSAGE_ROLES)),
	],
);

export const exchangeRelations = relations(exchange, ({ many }) => ({ messages: many(exchangeMessage), batches: many(agentBatch) }));
export const exchangeMessageRelations = relations(exchangeMessage, ({ one }) => ({
	exchange: one(exchange, { fields: [exchangeMessage.exchangeId], references: [exchange.id] }),
	delivery: one(agentDelivery, { fields: [exchangeMessage.deliveryId], references: [agentDelivery.id] }),
}));
export const agentBatchRelations = relations(agentBatch, ({ one, many }) => ({
	exchange: one(exchange, { fields: [agentBatch.exchangeId], references: [exchange.id] }),
	deliveries: many(agentDelivery),
}));
export const agentDeliveryRelations = relations(agentDelivery, ({ one }) => ({
	batch: one(agentBatch, { fields: [agentDelivery.batchId], references: [agentBatch.id] }),
	message: one(exchangeMessage),
}));

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
		/** A call was made from it while the learner did not help improve Libiamo: the admin never sees it (its calls go
		    after thirty days; this stays). */
		withheld: boolean("withheld").notNull().default(false),
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
		markedAt: integer("marked_at").array(),
		was: text("was"),
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
		// Review's count and sitting, both in one language.
		index("note_due_idx").on(t.userId, t.language, t.due).where(sql`${t.deletedAt} is null`),
		// The notebook's pages, newest first (by uuidv7 id).
		index("note_list_idx").on(t.userId, t.language, t.id).where(sql`${t.deletedAt} is null`),
		// Deleting an account (the partial indexes above cannot serve its cascade).
		index("note_user_idx").on(t.userId),
		index("note_piece_idx").on(t.pieceId),
		// Deleting a reading (with its account) sets this to null.
		index("note_reading_idx").on(t.readingId),
		// A phrase is collected once from the same words of the same sentence of a reading, whatever tab or visit it was
		// highlighted in; undone, it can be collected again.
		uniqueIndex("note_collected_unique")
			.on(t.readingId, sql`coalesce(${t.sentence}, '')`, t.marked)
			.where(sql`${t.readingId} is not null and ${t.deletedAt} is null`),
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
		requestId: uuid("request_id").unique(),
		elapsedSeconds: integer("elapsed_seconds").notNull(),
		prev: jsonb("prev").notNull(),
		next: jsonb("next").notNull(),
		reviewedAt: at("reviewed_at").defaultNow().notNull(),
	},
	(t) => [
		check("review_log_rating_check", sql`${t.rating} between 1 and 4`),
		check("review_log_verdict_check", sql`${t.verdict} is null or ${oneOf(t.verdict, VERDICTS)}`),
		index("review_log_note_idx").on(t.noteId),
		// Deleting an account.
		index("review_log_user_idx").on(t.userId),
	],
);

// --- Calls (§5.7) -----------------------------------------------------------------------------------------------------

// Prompts can contain learner text. Deduplication is per owner, never a way around deletion or retention.
export const llmPrompt = pgTable(
	"llm_prompt",
	{
		hash: text("hash").primaryKey(),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		text: text("text").notNull(),
	},
	(t) => [index("llm_prompt_user_idx").on(t.userId)],
);

/* Every model call, written after the fact. The numbers always; `messages` and `output` only while the learner helps
   improve Libiamo. A call on the environment's key (the gate) has no piece and may have no learner. */
export const llmCall = pgTable(
	"llm_call",
	{
		id: uuid("id").primaryKey().default(sql`uuidv7()`),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		pieceId: uuid("piece_id").references(() => piece.id, { onDelete: "cascade" }),
		/** A collecting call's reading (what the learner pasted): its record in the admin's sessions. */
		readingId: uuid("reading_id").references(() => reading.id, { onDelete: "cascade" }),
		stepSeq: integer("step_seq"),
		purpose: text("purpose").notNull(),
		tag: text("tag").notNull(),
		provider: text("provider").notNull(),
		model: text("model").notNull(),
		effort: text("effort"),
		state: text("state").notNull(),
		background: boolean("background").default(false).notNull(),
		/** The system prompt, stored once in `llm_prompt`. */
		promptHash: text("prompt_hash").references(() => llmPrompt.hash),
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
		index("llm_call_reading_idx").on(t.readingId),
		index("llm_call_created_idx").on(t.createdAt),
		index("llm_call_user_created_idx").on(t.userId, t.createdAt),
		index("llm_call_prompt_idx").on(t.promptHash),
	],
);

/* A flagged step of a piece's revision with the admin's note: the regression set. While a case is open its piece's
   calls are kept past thirty days. */
export const sessionCase = pgTable(
	"session_case",
	{
		id: serial("id").primaryKey(),
		pieceId: uuid("piece_id")
			.notNull()
			.references(() => piece.id, { onDelete: "cascade" }),
		stepSeq: integer("step_seq"),
		note: text("note").notNull(),
		createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
		status: text("status").notNull().default("open"),
		commit: text("commit"),
		createdAt: created(),
		closedAt: at("closed_at"),
	},
	(t) => [check("session_case_status_check", oneOf(t.status, CASE_STATUSES)), index("session_case_piece_idx").on(t.pieceId)],
);
