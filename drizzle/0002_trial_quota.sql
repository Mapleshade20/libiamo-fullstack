CREATE TABLE "user_quota" (
	"user_id" text PRIMARY KEY NOT NULL,
	"trial_tokens_left" integer NOT NULL,
	"trial_tokens_total" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_quota_trial_tokens_left_non_negative" CHECK ("user_quota"."trial_tokens_left" >= 0),
	CONSTRAINT "user_quota_trial_tokens_total_positive" CHECK ("user_quota"."trial_tokens_total" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
