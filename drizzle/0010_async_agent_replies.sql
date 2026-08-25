CREATE TYPE "public"."agent_delivery_status" AS ENUM('pending', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_response_batch_kind" AS ENUM('opening', 'reply', 'follow_up');--> statement-breakpoint
CREATE TYPE "public"."agent_response_batch_status" AS ENUM('pending', 'processing', 'stale', 'delivery_pending', 'completed', 'no_reply', 'failed', 'cancelled', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."session_completion_reason" AS ENUM('user_requested', 'max_turns', 'max_session_age', 'follow_up_exhausted', 'terminated_abuse');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TABLE "agent_delivery" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"content" text NOT NULL,
	"reply_to_message_id" integer,
	"thread_metadata" jsonb,
	"status" "agent_delivery_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp NOT NULL,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_delivery_sequence_check" CHECK ("agent_delivery"."sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agent_response_batch" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"kind" "agent_response_batch_kind" NOT NULL,
	"status" "agent_response_batch_status" DEFAULT 'pending' NOT NULL,
	"due_at" timestamp NOT NULL,
	"input_message_id" integer,
	"input_version" integer DEFAULT 0 NOT NULL,
	"worker_id" text,
	"claim_token" text,
	"claimed_at" timestamp,
	"lease_expires_at" timestamp,
	"generation_count" integer DEFAULT 0 NOT NULL,
	"stale_count" integer DEFAULT 0 NOT NULL,
	"request_messages" jsonb,
	"raw_response" text,
	"parsed_result" jsonb,
	"provider_metadata" jsonb,
	"error" text,
	"allow_idle_follow_up" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "agent_response_batch_input_version_check" CHECK ("agent_response_batch"."input_version" >= 0),
	CONSTRAINT "agent_response_batch_generation_count_check" CHECK ("agent_response_batch"."generation_count" >= 0),
	CONSTRAINT "agent_response_batch_stale_count_check" CHECK ("agent_response_batch"."stale_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "urgency" "urgency";--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "completion_reason" "session_completion_reason";--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "last_processed_user_message_id" integer;--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "last_seen_assistant_message_id" integer;--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "follow_up_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_message" ADD COLUMN "response_batch_id" integer;--> statement-breakpoint
ALTER TABLE "session_message" ADD COLUMN "delivery_id" integer;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "urgency" "urgency";--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "max_session_age_seconds" integer;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "urgency" "urgency";--> statement-breakpoint
ALTER TABLE "template_contribution" ADD COLUMN "urgency" "urgency";--> statement-breakpoint
UPDATE "template"
SET "urgency" = CASE
	WHEN "interaction_type" = 'slow' THEN 'low'::"urgency"
	WHEN "interaction_type" = 'chat' THEN 'high'::"urgency"
	ELSE NULL
END;--> statement-breakpoint
UPDATE "template_contribution"
SET "urgency" = CASE
	WHEN "interaction_type" = 'slow' THEN 'low'::"urgency"
	WHEN "interaction_type" = 'chat' THEN 'high'::"urgency"
	ELSE NULL
END;--> statement-breakpoint
-- Translate templates carry no urgency by design, but the pre-existing manual
-- scheduling path never rejected them, so historical tasks may point at one.
-- Their urgency must still be materialized or the NOT NULL below fails outright.
-- Such tasks run no chat session, so the slowest preset is the harmless default.
UPDATE "task"
SET
	"urgency" = COALESCE("template"."urgency", 'low'::"urgency"),
	"max_session_age_seconds" = CASE COALESCE("template"."urgency", 'low'::"urgency")
		WHEN 'high'::"urgency" THEN 43200
		WHEN 'medium'::"urgency" THEN 259200
		ELSE 604800
	END
FROM "template"
WHERE "task"."template_id" = "template"."id";--> statement-breakpoint
UPDATE "practice_session"
SET
	"urgency" = "task"."urgency",
	"expires_at" = CASE
		WHEN "practice_session"."status" = 'in_progress' THEN CURRENT_TIMESTAMP + make_interval(secs => "task"."max_session_age_seconds")
		ELSE "practice_session"."started_at" + make_interval(secs => "task"."max_session_age_seconds")
	END
FROM "task"
WHERE "practice_session"."task_id" = "task"."id";--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "urgency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "max_session_age_seconds" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_session" ALTER COLUMN "urgency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_session" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "template" ALTER COLUMN "interaction_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "template_contribution" ALTER COLUMN "interaction_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."interaction_type";--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('chat', 'translate');--> statement-breakpoint
ALTER TABLE "template" ALTER COLUMN "interaction_type" SET DATA TYPE "public"."interaction_type" USING (CASE WHEN "interaction_type" = 'slow' THEN 'chat' ELSE "interaction_type" END)::"public"."interaction_type";--> statement-breakpoint
ALTER TABLE "template_contribution" ALTER COLUMN "interaction_type" SET DATA TYPE "public"."interaction_type" USING (CASE WHEN "interaction_type" = 'slow' THEN 'chat' ELSE "interaction_type" END)::"public"."interaction_type";--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD CONSTRAINT "agent_delivery_batch_id_agent_response_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."agent_response_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_response_batch" ADD CONSTRAINT "agent_response_batch_session_id_practice_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."practice_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_delivery_batch_sequence_idx" ON "agent_delivery" USING btree ("batch_id","sequence");--> statement-breakpoint
CREATE INDEX "agent_delivery_status_due_idx" ON "agent_delivery" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "agent_response_batch_status_due_idx" ON "agent_response_batch" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "agent_response_batch_session_status_idx" ON "agent_response_batch" USING btree ("session_id","status");--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_response_batch_id_agent_response_batch_id_fk" FOREIGN KEY ("response_batch_id") REFERENCES "public"."agent_response_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_message" ADD CONSTRAINT "session_message_delivery_id_agent_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."agent_delivery"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_session_expiry_idx" ON "practice_session" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_message_delivery_idx" ON "session_message" USING btree ("delivery_id");--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_follow_up_count_check" CHECK ("practice_session"."follow_up_count" >= 0 AND "practice_session"."follow_up_count" <= 2);--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_urgency_check" CHECK (("template"."interaction_type" = 'translate' AND "template"."urgency" IS NULL) OR ("template"."interaction_type" = 'chat' AND "template"."urgency" IS NOT NULL));
