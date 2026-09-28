ALTER TABLE "practice_session" DROP CONSTRAINT "practice_session_follow_up_count_check";--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "reply_to" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "agent_delivery" DROP COLUMN "reply_to_message_id";--> statement-breakpoint
ALTER TABLE "agent_delivery" DROP COLUMN "thread_metadata";--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_follow_up_count_check" CHECK ("practice_session"."follow_up_count" >= 0 AND "practice_session"."follow_up_count" <= 6);
