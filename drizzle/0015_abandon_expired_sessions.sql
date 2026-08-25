ALTER TABLE "practice_session" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "practice_session" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
DROP TYPE "public"."session_status";--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('in_progress', 'completed', 'evaluated', 'abandoned');--> statement-breakpoint
ALTER TABLE "practice_session" ALTER COLUMN "status" SET DATA TYPE "public"."session_status" USING "status"::"public"."session_status";--> statement-breakpoint
ALTER TABLE "practice_session" ALTER COLUMN "status" SET DEFAULT 'in_progress';--> statement-breakpoint
UPDATE "task"
SET "max_session_age_seconds" = 172800;--> statement-breakpoint
UPDATE "practice_session"
SET "status" = 'abandoned'
WHERE "completion_reason" IN ('max_session_age', 'terminated_abuse', 'follow_up_exhausted');--> statement-breakpoint
UPDATE "practice_session"
SET "expires_at" = "started_at" + make_interval(secs => 172800)
WHERE "status" = 'in_progress';--> statement-breakpoint
UPDATE "practice_session"
SET "completion_reason" = 'max_session_age'
WHERE "completion_reason" = 'follow_up_exhausted';--> statement-breakpoint
ALTER TABLE "practice_session" ALTER COLUMN "completion_reason" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."session_completion_reason";--> statement-breakpoint
CREATE TYPE "public"."session_completion_reason" AS ENUM('user_requested', 'max_turns', 'max_session_age', 'terminated_abuse');--> statement-breakpoint
ALTER TABLE "practice_session" ALTER COLUMN "completion_reason" SET DATA TYPE "public"."session_completion_reason" USING "completion_reason"::"public"."session_completion_reason";
