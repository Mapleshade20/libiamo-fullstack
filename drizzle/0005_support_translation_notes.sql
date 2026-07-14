ALTER TABLE "note" DROP CONSTRAINT "note_source_message_id_session_message_id_fk";
--> statement-breakpoint
ALTER TABLE "note" ALTER COLUMN "source_session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "language" "language_code";--> statement-breakpoint
ALTER TABLE "note" ADD COLUMN "source_translation_attempt_id" integer;--> statement-breakpoint
UPDATE "note"
SET "language" = "task"."language"
FROM "practice_session"
INNER JOIN "task" ON "task"."id" = "practice_session"."task_id"
WHERE "note"."source_session_id" = "practice_session"."id";--> statement-breakpoint
ALTER TABLE "note" ALTER COLUMN "language" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_source_translation_attempt_id_translation_attempt_id_fk" FOREIGN KEY ("source_translation_attempt_id") REFERENCES "public"."translation_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_source_translation_attempt_id_idx" ON "note" USING btree ("source_translation_attempt_id");--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "source_message_id";--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_exactly_one_source_check" CHECK (num_nonnulls("note"."source_session_id", "note"."source_translation_attempt_id") = 1);
