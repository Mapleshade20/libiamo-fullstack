CREATE TABLE "streak_day" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "streak_day_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "streak_day_state_check" CHECK ("streak_day"."state" in ('lit', 'covered'))
);
--> statement-breakpoint
ALTER TABLE "user_streak" ADD COLUMN "history_since" date;--> statement-breakpoint
ALTER TABLE "streak_day" ADD CONSTRAINT "streak_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Do not infer a month of worked days from an aggregate that also includes protection.
-- Only the retained day with both positive gates is provable.
INSERT INTO "streak_day" ("user_id", "day", "state")
SELECT "user_id", "progress_date", 'lit' FROM "user_streak"
WHERE "progress_date" = "through_date" AND "task_count" > 0 AND "review_cleared"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "user_streak" SET "history_since" = greatest(
  (CURRENT_TIMESTAMP AT TIME ZONE coalesce(
    (SELECT name FROM pg_timezone_names WHERE name = "user_streak"."time_zone" LIMIT 1), 'UTC'))::date,
  "progress_date", "through_date"
);
