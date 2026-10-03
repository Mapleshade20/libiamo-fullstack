ALTER TABLE "user_quota" ADD COLUMN "trial_tokens_released" integer;--> statement-breakpoint
ALTER TABLE "user_quota" ADD COLUMN "trial_release_started_at" timestamp;--> statement-breakpoint
-- Existing learners already hold their whole grant.
UPDATE "user_quota" SET "trial_tokens_released" = "trial_tokens_total", "trial_release_started_at" = "created_at";--> statement-breakpoint
ALTER TABLE "user_quota" ALTER COLUMN "trial_tokens_released" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_quota" ALTER COLUMN "trial_release_started_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_quota" DROP CONSTRAINT "user_quota_trial_tokens_left_non_negative";--> statement-breakpoint
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_trial_tokens_released_within_total" CHECK ("user_quota"."trial_tokens_released" between 0 and "user_quota"."trial_tokens_total");
