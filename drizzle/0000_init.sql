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
CREATE TABLE "piece" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"language" text NOT NULL,
	"kind" text NOT NULL,
	"scenario_id" text,
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
	"encrypted_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_key_provider_check" CHECK ("user_key"."provider" in ('openrouter', 'deepseek', 'openai', 'glm'))
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
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_revision" ADD CONSTRAINT "piece_revision_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_step" ADD CONSTRAINT "piece_step_piece_id_piece_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."piece"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_key" ADD CONSTRAINT "user_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_user_provider_unique" ON "account" USING btree ("user_id","provider_id");--> statement-breakpoint
CREATE INDEX "llm_call_piece_idx" ON "llm_call" USING btree ("piece_id");--> statement-breakpoint
CREATE INDEX "llm_call_created_idx" ON "llm_call" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "piece_user_idx" ON "piece" USING btree ("user_id","language","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "piece_open_scenario_unique" ON "piece" USING btree ("user_id","scenario_id") WHERE "piece"."scenario_id" is not null and "piece"."state" in ('writing', 'revising');--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");