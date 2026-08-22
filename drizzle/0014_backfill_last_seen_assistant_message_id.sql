-- Backfill the unread seen-watermark for sessions created before migration
-- 0010 introduced `last_seen_assistant_message_id`. NULL was previously treated
-- as 0 by the unread-inbox query, which surfaced every historical assistant
-- message as unread. Advance each legacy session's watermark to its latest
-- assistant message so pre-existing conversations start out fully read.
UPDATE "practice_session"
SET "last_seen_assistant_message_id" = "latest_assistant_message"."max_id"
FROM (
	SELECT "session_id", max("id") AS "max_id"
	FROM "session_message"
	WHERE "role" = 'assistant'
	GROUP BY "session_id"
) AS "latest_assistant_message"
WHERE "practice_session"."id" = "latest_assistant_message"."session_id"
	AND "practice_session"."last_seen_assistant_message_id" IS NULL;
