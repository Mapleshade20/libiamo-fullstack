DROP INDEX "practice_session_archive_idx";--> statement-breakpoint
CREATE INDEX "practice_session_archive_idx" ON "practice_session" USING btree ("user_id","evaluation_phase","evaluation_completed_at");
