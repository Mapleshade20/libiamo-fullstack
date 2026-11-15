CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"exchange_id" integer NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"input_message_id" integer,
	"input_version" integer DEFAULT 0 NOT NULL,
	"target_ref" text,
	"participant" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"worker_id" text,
	"claim_token" text,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"generation_count" integer DEFAULT 0 NOT NULL,
	"stale_count" integer DEFAULT 0 NOT NULL,
	"request_messages" jsonb,
	"raw_response" text,
	"parsed_result" jsonb,
	"provider_metadata" jsonb,
	"error" text,
	"allow_idle_follow_up" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "agent_batch_kind_check" CHECK ("agent_batch"."kind" in ('opening', 'reply', 'follow_up', 'world')),
	CONSTRAINT "agent_batch_status_check" CHECK ("agent_batch"."status" in ('pending', 'processing', 'stale', 'delivery_pending', 'completed', 'no_reply', 'failed', 'cancelled', 'terminated')),
	CONSTRAINT "agent_batch_counts_check" CHECK ("agent_batch"."input_version" >= 0 and "agent_batch"."generation_count" >= 0 and "agent_batch"."stale_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_delivery" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"content" text NOT NULL,
	"author" text,
	"reply_to" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_delivery_sequence_check" CHECK ("agent_delivery"."sequence" >= 0),
	CONSTRAINT "agent_delivery_status_check" CHECK ("agent_delivery"."status" in ('pending', 'delivered', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_read" (
	"user_id" text NOT NULL,
	"announcement_id" integer NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcement_read_user_id_announcement_id_pk" PRIMARY KEY("user_id","announcement_id")
);
--> statement-breakpoint
CREATE TABLE "exchange" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"piece_id" uuid NOT NULL,
	"scenario_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completion_reason" text,
	"last_processed_user_message_id" integer,
	"last_seen_assistant_message_id" integer,
	"agent_read_up_to_message_id" integer,
	"follow_up_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "exchange_piece_id_unique" UNIQUE("piece_id"),
	CONSTRAINT "exchange_status_check" CHECK ("exchange"."status" in ('in_progress', 'completed', 'abandoned')),
	CONSTRAINT "exchange_completion_reason_check" CHECK ("exchange"."completion_reason" is null or "exchange"."completion_reason" in ('user_requested', 'max_turns', 'max_age', 'terminated_abuse')),
	CONSTRAINT "exchange_follow_up_count_check" CHECK ("exchange"."follow_up_count" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "exchange_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"exchange_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"llm_metadata" jsonb,
	"response_batch_id" integer,
	"delivery_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_message_role_check" CHECK ("exchange_message"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"page" text,
	"browser" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	CONSTRAINT "feedback_kind_check" CHECK ("feedback"."kind" in ('idea', 'bug', 'other'))
);
--> statement-breakpoint
CREATE TABLE "issue" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"title" jsonb NOT NULL,
	"line" jsonb NOT NULL,
	"tone" text NOT NULL,
	"deep" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_scenario" (
	"issue_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "issue_scenario_issue_id_scenario_id_pk" PRIMARY KEY("issue_id","scenario_id")
);
--> statement-breakpoint
CREATE TABLE "llm_call" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text,
	"piece_id" uuid,
	"step_seq" integer,
	"purpose" text NOT NULL,
	"tag" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"effort" text,
	"state" text NOT NULL,
	"background" boolean DEFAULT false NOT NULL,
	"prompt_hash" text,
	"messages" jsonb,
	"output" text,
	"error" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"reasoning_tokens" integer,
	"cache_read" integer,
	"cache_write" integer,
	"cost_usd" double precision,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_call_state_check" CHECK ("llm_call"."state" in ('done', 'failed', 'repaired', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "llm_prompt" (
	"hash" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "name_rendering" (
	"work_id" text NOT NULL,
	"locale" text NOT NULL,
	"term" text NOT NULL,
	"kind" text DEFAULT 'name' NOT NULL,
	"rendering" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"origin" text,
	"url" text,
	"why" text,
	"candidates" jsonb,
	CONSTRAINT "name_rendering_work_id_locale_term_pk" PRIMARY KEY("work_id","locale","term"),
	CONSTRAINT "name_rendering_kind_check" CHECK ("name_rendering"."kind" in ('name', 'term')),
	CONSTRAINT "name_rendering_status_check" CHECK ("name_rendering"."status" in ('pending', 'confirmed'))
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"language" text NOT NULL,
	"kind" text NOT NULL,
	"piece_id" uuid,
	"reading_id" uuid,
	"phrase" text NOT NULL,
	"meaning" text DEFAULT '' NOT NULL,
	"meaning_language" text NOT NULL,
	"usage" text,
	"register" text,
	"why" text,
	"examples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentence" text,
	"marked" text,
	"was" text,
	"also" text[] DEFAULT '{}'::text[] NOT NULL,
	"fsrs" jsonb NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_language_check" CHECK ("note"."language" in ('en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh-CN', 'ru', 'ar', 'nl', 'tr', 'pl')),
	CONSTRAINT "note_kind_check" CHECK ("note"."kind" in ('own', 'collected')),
	CONSTRAINT "note_register_check" CHECK ("note"."register" is null or "note"."register" in ('neutral', 'casual', 'formal', 'slang', 'literary', 'technical'))
);
--> statement-breakpoint
CREATE TABLE "piece" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"language" text NOT NULL,
	"kind" text NOT NULL,
	"scenario_id" text,
	"source_id" uuid,
	"place" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"background" text,
	"context" text,
	"tutor_language" text NOT NULL,
	"detail" text DEFAULT 'needed' NOT NULL,
	"provider" text,
	"model" text,
	"state" text DEFAULT 'revising' NOT NULL,
	"final" text,
	"closing" text,
	"reader" text,
	"leftovers" jsonb,
	"authentic" text,
	"learned" jsonb,
	"finished_at" timestamp with time zone,
	"notes_requested_at" timestamp with time zone,
	"notes_tries" integer DEFAULT 0 NOT NULL,
	"posted" text,
	"asked_at" timestamp with time zone,
	"again_text" text,
	"again_at" timestamp with time zone,
	"sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "piece_language_check" CHECK ("piece"."language" in ('en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh-CN', 'ru', 'ar', 'nl', 'tr', 'pl')),
	CONSTRAINT "piece_kind_check" CHECK ("piece"."kind" in ('own', 'scenario', 'translation')),
	CONSTRAINT "piece_detail_check" CHECK ("piece"."detail" in ('needed', 'more')),
	CONSTRAINT "piece_state_check" CHECK ("piece"."state" in ('writing', 'revising', 'finished', 'set_aside')),
	CONSTRAINT "piece_posted_check" CHECK ("piece"."posted" is null or "piece"."posted" in ('yes', 'not_yet', 'no')),
	CONSTRAINT "piece_finished_check" CHECK (("piece"."state" = 'finished') = ("piece"."finished_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "piece_revision" (
	"piece_id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "piece_step" (
	"piece_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"action" text NOT NULL,
	"body" jsonb,
	"response" jsonb,
	"error" text,
	"ms" integer,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "piece_step_piece_id_seq_pk" PRIMARY KEY("piece_id","seq")
);
--> statement-breakpoint
CREATE TABLE "practice_day" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"learned_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "practice_day_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "reading" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"place" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_language_check" CHECK ("reading"."language" in ('en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh-CN', 'ru', 'ar', 'nl', 'tr', 'pl'))
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"verdict" text,
	"elapsed_seconds" integer NOT NULL,
	"prev" jsonb NOT NULL,
	"next" jsonb NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_log_rating_check" CHECK ("review_log"."rating" between 1 and 4),
	CONSTRAINT "review_log_verdict_check" CHECK ("review_log"."verdict" is null or "review_log"."verdict" in ('exact', 'close', 'other', 'miss', 'none'))
);
--> statement-breakpoint
CREATE TABLE "scenario" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"place" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"minutes" integer NOT NULL,
	"urgency" text,
	"max_turns" integer,
	"work_id" text,
	"versions" jsonb NOT NULL,
	"created_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_kind_check" CHECK ("scenario"."kind" in ('exchange', 'translation')),
	CONSTRAINT "scenario_place_check" CHECK ("scenario"."place" in ('ao3', 'reddit', 'email', 'discord', 'imessage', 'translation')),
	CONSTRAINT "scenario_status_check" CHECK ("scenario"."status" in ('draft', 'published', 'withdrawn')),
	CONSTRAINT "scenario_urgency_check" CHECK ("scenario"."urgency" is null or "scenario"."urgency" in ('high', 'medium', 'low')),
	CONSTRAINT "scenario_kind_place_check" CHECK (("scenario"."kind" = 'translation') = ("scenario"."place" = 'translation')),
	CONSTRAINT "scenario_minutes_check" CHECK ("scenario"."minutes" > 0),
	CONSTRAINT "scenario_max_turns_check" CHECK ("scenario"."max_turns" is null or "scenario"."max_turns" > 0)
);
--> statement-breakpoint
CREATE TABLE "scenario_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scenario_id" text NOT NULL,
	"language" text NOT NULL,
	"native" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"glossary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"notes" jsonb,
	"original_hash" text,
	"made_at" timestamp with time zone,
	CONSTRAINT "scenario_source_state_check" CHECK ("scenario_source"."state" in ('pending', 'checked', 'notes', 'confirmed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "session_case" (
	"id" serial PRIMARY KEY NOT NULL,
	"piece_id" uuid NOT NULL,
	"step_seq" integer,
	"note" text NOT NULL,
	"created_by" text,
	"status" text DEFAULT 'open' NOT NULL,
	"commit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "session_case_status_check" CHECK ("session_case"."status" in ('open', 'fixed', 'wontfix'))
);
--> statement-breakpoint
CREATE TABLE "suggestion" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"place" text NOT NULL,
	"language" text NOT NULL,
	"situation" text NOT NULL,
	"capture" jsonb,
	"purpose" text NOT NULL,
	"mine" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"scenario_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "suggestion_place_check" CHECK ("suggestion"."place" in ('ao3', 'reddit', 'email', 'discord', 'imessage', 'other')),
	CONSTRAINT "suggestion_status_check" CHECK ("suggestion"."status" in ('pending', 'live', 'unused'))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'learner' NOT NULL,
	"native_language" text,
	"learning_languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"active_language" text,
	"tutor_language" text DEFAULT 'native' NOT NULL,
	"weekly_goal" integer DEFAULT 3 NOT NULL,
	"time_zone" text,
	"help_improve" boolean DEFAULT true NOT NULL,
	"onboarded_at" timestamp with time zone,
	"pending_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('learner', 'admin')),
	CONSTRAINT "user_native_language_check" CHECK ("user"."native_language" is null or "user"."native_language" in ('en', 'ru', 'es', 'de', 'tr', 'fa', 'fr', 'ja', 'pt', 'zh-CN', 'vi', 'it', 'ar', 'pl', 'el', 'nl', 'id', 'ko')),
	CONSTRAINT "user_learning_languages_check" CHECK ("user"."learning_languages" <@ array['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh-CN', 'ru', 'ar', 'nl', 'tr', 'pl']::text[]),
	CONSTRAINT "user_active_language_check" CHECK ("user"."active_language" is null or "user"."active_language" = any("user"."learning_languages")),
	CONSTRAINT "user_tutor_language_check" CHECK ("user"."tutor_language" in ('native', 'target')),
	CONSTRAINT "user_weekly_goal_check" CHECK ("user"."weekly_goal" between 1 and 7),
	CONSTRAINT "user_onboarded_check" CHECK ("user"."onboarded_at" is null or ("user"."native_language" is not null and "user"."active_language" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_key" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"decision_model" text,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_key_provider_check" CHECK ("user_key"."provider" in ('openrouter', 'deepseek', 'openai', 'glm'))
);
--> statement-breakpoint
CREATE TABLE "user_week" (
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"goal" integer NOT NULL,
	CONSTRAINT "user_week_user_id_week_start_pk" PRIMARY KEY("user_id","week_start"),
	CONSTRAINT "user_week_goal_check" CHECK ("user_week"."goal" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"wikidata" text,
	"wikis" jsonb,
	"manual" jsonb
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_batch" ADD CONSTRAINT "agent_batch_exchange_id_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD CONSTRAINT "agent_delivery_batch_id_agent_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."agent_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_announcement_id_announcement_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange" ADD CONSTRAINT "exchange_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_message" ADD CONSTRAINT "exchange_message_exchange_id_exchange_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_message" ADD CONSTRAINT "exchange_message_response_batch_id_agent_batch_id_fk" FOREIGN KEY ("response_batch_id") REFERENCES "public"."agent_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_message" ADD CONSTRAINT "exchange_message_delivery_id_agent_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."agent_delivery"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_scenario" ADD CONSTRAINT "issue_scenario_issue_id_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_scenario" ADD CONSTRAINT "issue_scenario_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "name_rendering" ADD CONSTRAINT "name_rendering_work_id_work_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_reading_id_reading_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."reading"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_source_id_scenario_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."scenario_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_revision" ADD CONSTRAINT "piece_revision_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_step" ADD CONSTRAINT "piece_step_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_day" ADD CONSTRAINT "practice_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading" ADD CONSTRAINT "reading_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_work_id_work_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."work"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_source" ADD CONSTRAINT "scenario_source_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_case" ADD CONSTRAINT "session_case_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_case" ADD CONSTRAINT "session_case_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_scenario_id_scenario_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_key" ADD CONSTRAINT "user_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_week" ADD CONSTRAINT "user_week_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_user_provider_unique" ON "account" USING btree ("user_id","provider_id");--> statement-breakpoint
CREATE INDEX "agent_batch_status_due_idx" ON "agent_batch" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "agent_batch_exchange_status_idx" ON "agent_batch" USING btree ("exchange_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_batch_world_outstanding_idx" ON "agent_batch" USING btree ("exchange_id") WHERE "agent_batch"."kind" = 'world' and "agent_batch"."status" in ('pending', 'processing', 'stale', 'delivery_pending');--> statement-breakpoint
CREATE UNIQUE INDEX "agent_delivery_batch_sequence_idx" ON "agent_delivery" USING btree ("batch_id","sequence");--> statement-breakpoint
CREATE INDEX "agent_delivery_status_due_idx" ON "agent_delivery" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "exchange_user_idx" ON "exchange" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "exchange_expiry_idx" ON "exchange" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "exchange_message_exchange_idx" ON "exchange_message" USING btree ("exchange_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_message_delivery_idx" ON "exchange_message" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "exchange_message_unread_idx" ON "exchange_message" USING btree ("exchange_id","id") WHERE "exchange_message"."role" = 'assistant';--> statement-breakpoint
CREATE INDEX "llm_call_piece_idx" ON "llm_call" USING btree ("piece_id");--> statement-breakpoint
CREATE INDEX "llm_call_created_idx" ON "llm_call" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "note_due_idx" ON "note" USING btree ("user_id","due") WHERE "note"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "note_piece_idx" ON "note" USING btree ("piece_id");--> statement-breakpoint
CREATE INDEX "piece_user_idx" ON "piece" USING btree ("user_id","language","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "piece_open_scenario_unique" ON "piece" USING btree ("user_id","scenario_id") WHERE "piece"."scenario_id" is not null and "piece"."state" in ('writing', 'revising');--> statement-breakpoint
CREATE INDEX "reading_user_idx" ON "reading" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_log_note_idx" ON "review_log" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_source_unique" ON "scenario_source" USING btree ("scenario_id","language","native");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_case_piece_idx" ON "session_case" USING btree ("piece_id");--> statement-breakpoint
CREATE INDEX "suggestion_user_idx" ON "suggestion" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");