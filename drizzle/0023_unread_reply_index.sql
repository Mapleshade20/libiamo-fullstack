CREATE INDEX "session_message_unread_idx" ON "session_message" USING btree ("session_id","id") WHERE "session_message"."role" = 'assistant';
