CREATE INDEX "practice_session_archive_idx" ON "practice_session" USING btree ("user_id","status","completed_at");
