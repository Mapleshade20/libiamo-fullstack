CREATE TYPE "public"."cadence" AS ENUM('weekly', 'daily', 'none');--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('chat', 'slow', 'translate');--> statement-breakpoint
CREATE TYPE "public"."language_code" AS ENUM('en', 'es', 'fr', 'ja');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."schedule_origin" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('in_progress', 'completed', 'evaluated');--> statement-breakpoint
CREATE TYPE "public"."ui_variant" AS ENUM('reddit', 'apple_mail', 'discord', 'imessage', 'ao3', 'translator');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('learner', 'admin');--> statement-breakpoint
CREATE TABLE "note" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_session_id" integer NOT NULL,
	"source_message_id" integer,
	"tutor_comment" text NOT NULL,
	"keywords" text[],
	"source_context" text,
	"review_status" text
);
--> statement-breakpoint
CREATE TABLE "practice_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" integer NOT NULL,
	"agent_prompt_snapshot" jsonb NOT NULL,
	"status" "session_status" DEFAULT 'in_progress' NOT NULL,
	"tutor_feedback" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "review_card" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_note_id" integer,
	"language" "language_code" NOT NULL,
	"card_type" text NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	"fsrs_card" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"rating" integer NOT NULL,
	"elapsed_seconds" integer NOT NULL,
	"scheduled_days" integer NOT NULL,
	"prev_card" jsonb NOT NULL,
	"new_card" jsonb NOT NULL,
	"log" jsonb NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"llm_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"language" "language_code" NOT NULL,
	"cadence" "cadence" NOT NULL,
	"date" date NOT NULL,
	"origin" "schedule_origin" NOT NULL,
	"title" text NOT NULL,
	"short_objective" text,
	"description" text,
	"objectives" text[],
	"agent_prompt" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" serial PRIMARY KEY NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"agent_starts_first" boolean DEFAULT true NOT NULL,
	"language" "language_code" NOT NULL,
	"interaction_type" "interaction_type" NOT NULL,
	"ui" "ui_variant" NOT NULL,
	"cadence" "cadence" NOT NULL,
	"title_base" text NOT NULL,
	"short_objective_base" text,
	"description_base" text,
	"objectives_base" text[],
	"agent_prompt_base" text,
	"materials_md" text,
	"translation_base" jsonb,
	"tags" text[],
	"max_turns" integer,
	"estimated_words" integer,
	"difficulty" integer NOT NULL,
	"point_reward" integer NOT NULL,
	"gem_reward" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "difficulty_check" CHECK ("template"."difficulty" >= 1 AND "template"."difficulty" <= 3)
);
--> statement-breakpoint
CREATE TABLE "template_contribution" (
	"id" serial PRIMARY KEY NOT NULL,
	"language" "language_code" NOT NULL,
	"interaction_type" "interaction_type" NOT NULL,
	"ui" "ui_variant" NOT NULL,
	"cadence" "cadence",
	"agent_starts_first" boolean,
	"title_base" text NOT NULL,
	"short_objective_base" text,
	"description_base" text,
	"objectives_base" text[],
	"agent_prompt_base" text,
	"materials_md" text,
	"translation_base" jsonb,
	"tags" text[],
	"slot_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opening_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"difficulty" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text NOT NULL,
	"reviewed_by" text,
	"review_notes" text,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_variant" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"slot_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opening_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_attempt" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"template_id" integer NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"evaluation" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_learning_profile" (
	"user_id" text NOT NULL,
	"language" "language_code" NOT NULL,
	"level_self_assign" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_learning_profile_user_id_language_pk" PRIMARY KEY("user_id","language"),
	CONSTRAINT "level_check" CHECK ("user_learning_profile"."level_self_assign" >= 1 AND "user_learning_profile"."level_self_assign" <= 3)
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'learner' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"native_language" text,
	"gems_balance" integer DEFAULT 0 NOT NULL,
	"active_language" "language_code" NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_api_key" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_key" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_source_session_id_practice_session_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."practice_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_source_message_id_session_message_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."session_message"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_card" ADD CONSTRAINT "review_card_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_card" ADD CONSTRAINT "review_card_source_note_id_note_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_card_id_review_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."review_card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_session_id_practice_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_variant_id_template_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."template_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_contribution" ADD CONSTRAINT "template_contribution_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_contribution" ADD CONSTRAINT "template_contribution_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_variant" ADD CONSTRAINT "template_variant_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD CONSTRAINT "translation_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD CONSTRAINT "translation_attempt_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_learning_profile" ADD CONSTRAINT "user_learning_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_api_key" ADD CONSTRAINT "user_api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_user_id_idx" ON "note" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "note_source_session_id_idx" ON "note" USING btree ("source_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_session_user_task_idx" ON "practice_session" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE INDEX "review_card_user_lang_idx" ON "review_card" USING btree ("user_id","language");--> statement-breakpoint
CREATE UNIQUE INDEX "review_card_source_note_unique" ON "review_card" USING btree ("source_note_id");--> statement-breakpoint
CREATE INDEX "review_log_card_idx" ON "review_log" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "review_log_user_reviewed_idx" ON "review_log" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "session_message_session_idx" ON "session_message" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_date_template_idx" ON "task" USING btree ("date","template_id");--> statement-breakpoint
CREATE INDEX "task_language_date_idx" ON "task" USING btree ("language","date");--> statement-breakpoint
CREATE INDEX "task_language_cadence_date_idx" ON "task" USING btree ("language","cadence","date");--> statement-breakpoint
CREATE UNIQUE INDEX "template_id_language_idx" ON "template" USING btree ("id","language");--> statement-breakpoint
CREATE INDEX "template_variant_template_id_idx" ON "template_variant" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "translation_attempt_user_template_idx" ON "translation_attempt" USING btree ("user_id","template_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
