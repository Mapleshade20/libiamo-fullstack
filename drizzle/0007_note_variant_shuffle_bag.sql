ALTER TABLE "note" ADD COLUMN "exercise_order" jsonb DEFAULT '[0,1,2,3]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "exercise_cursor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "last_exercise_ordinal";--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_exercise_cursor_check" CHECK ("note"."exercise_cursor" >= 0 AND "note"."exercise_cursor" < 4);
