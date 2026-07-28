-- The old pattern/explanation/variant shape cannot be mapped to vocabulary plus
-- two independently authored dictionary definitions without fabricating data.
-- This remains a pre-production breaking migration, so reset translation
-- attempts and their generated learning data before enforcing the new shape.
TRUNCATE TABLE "translation_attempt", "note", "review_log" CASCADE;--> statement-breakpoint
ALTER TABLE "note_exercise_variant" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "note_exercise_variant" CASCADE;--> statement-breakpoint
ALTER TABLE "note" DROP CONSTRAINT "note_exercise_cursor_check";--> statement-breakpoint
ALTER TABLE "note" DROP CONSTRAINT "note_content_nonempty_check";--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "vocab" text NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "target_definition" text NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "native_definition" text NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "examples" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "target_pattern";--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "explanation";--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "exercise_order";--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "exercise_cursor";--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_examples_nonempty_check" CHECK (jsonb_typeof("note"."examples") = 'array' AND jsonb_array_length("note"."examples") > 0);--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_content_nonempty_check" CHECK (length(btrim("note"."vocab")) > 0 AND length(btrim("note"."target_definition")) > 0 AND length(btrim("note"."native_definition")) > 0);
