CREATE TABLE "streak_day" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "streak_day_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "streak_day_state_check" CHECK ("streak_day"."state" in ('lit', 'covered'))
);
--> statement-breakpoint
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
DROP INDEX "practice_session_archive_idx";--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "evaluation_phase" text DEFAULT 'feedback' NOT NULL;--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "evaluation_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "streak_day" ADD CONSTRAINT "streak_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_streak" ADD CONSTRAINT "user_streak_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_session_archive_idx" ON "practice_session" USING btree ("user_id","evaluation_phase","evaluation_completed_at");--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_evaluation_phase_check" CHECK ("practice_session"."evaluation_phase" IN ('feedback', 'transfer', 'completed'));--> statement-breakpoint
-- Sessions that ended before this migration were already credited when the conversation ended.
UPDATE "practice_session" SET "evaluation_phase" = 'completed', "evaluation_completed_at" = "completed_at" WHERE "status" IN ('completed', 'evaluated');
