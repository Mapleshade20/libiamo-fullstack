ALTER TABLE "note" ADD CONSTRAINT "note_content_nonempty_check" CHECK (length(btrim("note"."target_pattern")) > 0 AND length(btrim("note"."explanation")) > 0);--> statement-breakpoint
ALTER TABLE "note_exercise_variant" ADD CONSTRAINT "note_exercise_variant_content_nonempty_check" CHECK (length(btrim("note_exercise_variant"."front")) > 0 AND length(btrim("note_exercise_variant"."back")) > 0);--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_rating_check" CHECK ("review_log"."rating" >= 1 AND "review_log"."rating" <= 4);--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_elapsed_seconds_check" CHECK ("review_log"."elapsed_seconds" >= 0);--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_scheduled_days_check" CHECK ("review_log"."scheduled_days" >= 0);--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD CONSTRAINT "translation_attempt_workflow_phase_check" CHECK ("translation_attempt"."workflow_phase" IN ('draft', 'submitted', 'correction', 'second_draft', 'transfer', 'completed'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_feedback_language_preference_check" CHECK ("user"."feedback_language_preference" IN ('native', 'target'));
