ALTER TABLE "user_quota" DROP CONSTRAINT "user_quota_trial_tokens_total_positive";--> statement-breakpoint
ALTER TABLE "user_quota" ADD COLUMN "trial_email_key" text;--> statement-breakpoint
-- Same normalization as `trialEmailKey` in src/lib/auth/email-domain.ts. Existing grants stay; only the
-- earliest account per mailbox records the key, so later aliases of it get none.
WITH keyed AS (
	SELECT q."user_id", CASE
		WHEN e.domain IN ('gmail.com', 'googlemail.com') THEN replace(e.local, '.', '') || '@gmail.com'
		ELSE e.local || '@' || e.domain
	END AS key, q."created_at"
	FROM "user_quota" q
	JOIN "user" u ON u."id" = q."user_id"
	CROSS JOIN LATERAL (
		SELECT split_part(split_part(lower(trim(u."email")), '@', 1), '+', 1) AS local,
			rtrim(split_part(lower(trim(u."email")), '@', 2), '.') AS domain
	) e
), first_per_key AS (
	SELECT DISTINCT ON (key) "user_id", key FROM keyed ORDER BY key, "created_at", "user_id"
)
UPDATE "user_quota" q SET "trial_email_key" = f.key FROM first_per_key f WHERE q."user_id" = f."user_id";--> statement-breakpoint
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_trial_email_key_unique" UNIQUE("trial_email_key");--> statement-breakpoint
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_trial_tokens_total_non_negative" CHECK ("user_quota"."trial_tokens_total" >= 0);
