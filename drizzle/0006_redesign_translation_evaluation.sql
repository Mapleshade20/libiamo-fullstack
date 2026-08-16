-- This pre-production redesign intentionally discards legacy attempts, notes,
-- cards, and logs. Their shapes cannot be mapped to the new active-learning
-- workflow without inventing missing exercises and evaluation state.
TRUNCATE TABLE "translation_attempt", "note", "review_log" CASCADE;--> statement-breakpoint
ALTER TABLE "translation_attempt" RENAME COLUMN "status" TO "workflow_phase";--> statement-breakpoint
ALTER TABLE "review_log" DROP CONSTRAINT "review_log_card_id_review_card_id_fk";
--> statement-breakpoint
DROP INDEX "review_log_card_idx";--> statement-breakpoint
DROP INDEX "translation_attempt_user_source_set_idx";--> statement-breakpoint
ALTER TABLE "review_card" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "review_card";--> statement-breakpoint
CREATE TABLE "note_exercise_variant" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"front" text NOT NULL,
	"back" text NOT NULL,
	CONSTRAINT "note_exercise_variant_ordinal_check" CHECK ("note_exercise_variant"."ordinal" >= 0 AND "note_exercise_variant"."ordinal" < 4)
);
--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "target_pattern" text NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "explanation" text NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "fsrs_card" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "last_exercise_ordinal" integer;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "review_log" ADD COLUMN "note_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD COLUMN "generation_1_messages" jsonb;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD COLUMN "feedback_language" text;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD COLUMN "practice_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "feedback_language_preference" text DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "note_exercise_variant" ADD CONSTRAINT "note_exercise_variant_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_exercise_variant_note_ordinal_idx" ON "note_exercise_variant" USING btree ("note_id","ordinal");--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_note_id_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_log_note_idx" ON "review_log" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_attempt_active_user_source_set_idx" ON "translation_attempt" USING btree ("user_id","source_set_id") WHERE "translation_attempt"."workflow_phase" <> 'completed';--> statement-breakpoint
CREATE INDEX "translation_attempt_source_phase_idx" ON "translation_attempt" USING btree ("source_set_id","workflow_phase");--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "tutor_comment";--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "keywords";--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "source_context";--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "review_status";--> statement-breakpoint
ALTER TABLE "review_log" DROP COLUMN "card_id";
