ALTER TABLE "practice_session" ADD COLUMN "evaluation_phase" text DEFAULT 'feedback' NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "evaluation_completed_at" timestamp;--> statement-breakpoint
-- Sessions that ended before this migration were already credited when the conversation ended.
UPDATE "practice_session" SET "evaluation_phase" = 'completed', "evaluation_completed_at" = coalesce("transfer_completed_at", "completed_at") WHERE "status" IN ('completed', 'evaluated');--> statement-breakpoint
ALTER TABLE "practice_session" DROP COLUMN "transfer_completed_at";--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_evaluation_phase_check" CHECK ("practice_session"."evaluation_phase" IN ('feedback', 'transfer', 'completed'));
