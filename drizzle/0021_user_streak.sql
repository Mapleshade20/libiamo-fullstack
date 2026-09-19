CREATE TABLE "user_streak" (
	"user_id" text PRIMARY KEY NOT NULL,
	"streak_days" integer DEFAULT 0 NOT NULL,
	"through_date" date,
	"bank" integer DEFAULT 0 NOT NULL,
	"progress_date" date,
	"task_count" integer DEFAULT 0 NOT NULL,
	"review_cleared" boolean DEFAULT false NOT NULL,
	"bank_earned_today" integer DEFAULT 0 NOT NULL,
	"time_zone" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_streak_days_non_negative" CHECK ("user_streak"."streak_days" >= 0),
	CONSTRAINT "user_streak_bank_range" CHECK ("user_streak"."bank" between 0 and 3),
	CONSTRAINT "user_streak_bank_earned_today_range" CHECK ("user_streak"."bank_earned_today" between 0 and 3),
	CONSTRAINT "user_streak_task_count_non_negative" CHECK ("user_streak"."task_count" >= 0),
	CONSTRAINT "user_streak_through_date_present" CHECK (("user_streak"."streak_days" = 0) = ("user_streak"."through_date" is null))
);
--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "transfer_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_streak" ADD CONSTRAINT "user_streak_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
