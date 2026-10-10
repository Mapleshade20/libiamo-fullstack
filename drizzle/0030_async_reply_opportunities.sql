ALTER TYPE "public"."agent_response_batch_kind" ADD VALUE 'world';--> statement-breakpoint
ALTER TABLE "agent_response_batch" ADD COLUMN "target_ref" text;--> statement-breakpoint
ALTER TABLE "agent_response_batch" ADD COLUMN "participant" text;--> statement-breakpoint
ALTER TABLE "agent_response_batch" ADD COLUMN "attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_response_batch_world_outstanding_idx" ON "agent_response_batch" USING btree ("session_id") WHERE "agent_response_batch"."kind" not in ('opening', 'reply', 'follow_up') and "agent_response_batch"."status" in ('pending', 'processing', 'stale', 'delivery_pending');
