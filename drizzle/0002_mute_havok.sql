CREATE TABLE "user_quota" (
	"user_id" text PRIMARY KEY NOT NULL,
	"trial_tokens" integer DEFAULT 50000 NOT NULL,
	"trial_total_tokens" integer DEFAULT 50000 NOT NULL,
	"low_balance_notice_pending" boolean DEFAULT false NOT NULL,
	"depleted_notice_pending" boolean DEFAULT false NOT NULL,
	"low_balance_notified_at" timestamp,
	"depleted_notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_quota_trial_total_positive" CHECK ("user_quota"."trial_total_tokens" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "user_quota" ("user_id", "trial_tokens", "trial_total_tokens")
SELECT "id", 50000, 50000
FROM "user"
ON CONFLICT ("user_id") DO NOTHING;
