ALTER TABLE "user_learning_profile" ADD COLUMN "level_self_assign_by_language" jsonb;--> statement-breakpoint

WITH "aggregated_profiles" AS (
	SELECT
		"user_id",
		jsonb_build_object(
			'en', COALESCE(MAX("level_self_assign") FILTER (WHERE "language" = 'en'), 2),
			'es', COALESCE(MAX("level_self_assign") FILTER (WHERE "language" = 'es'), 2),
			'fr', COALESCE(MAX("level_self_assign") FILTER (WHERE "language" = 'fr'), 2),
			'ja', COALESCE(MAX("level_self_assign") FILTER (WHERE "language" = 'ja'), 2)
		) AS "levels",
		MIN("created_at") AS "created_at",
		MAX("updated_at") AS "updated_at"
	FROM "user_learning_profile"
	GROUP BY "user_id"
)
UPDATE "user_learning_profile" AS "profile"
SET
	"level_self_assign_by_language" = "aggregated_profiles"."levels",
	"created_at" = "aggregated_profiles"."created_at",
	"updated_at" = "aggregated_profiles"."updated_at"
FROM "aggregated_profiles"
WHERE "profile"."user_id" = "aggregated_profiles"."user_id";--> statement-breakpoint

INSERT INTO "user_learning_profile" (
	"user_id",
	"language",
	"level_self_assign",
	"level_self_assign_by_language"
)
SELECT
	"user"."id",
	'en'::"language_code",
	2,
	'{"en":2,"es":2,"fr":2,"ja":2}'::jsonb
FROM "user"
WHERE NOT EXISTS (
	SELECT 1
	FROM "user_learning_profile"
	WHERE "user_learning_profile"."user_id" = "user"."id"
);--> statement-breakpoint

ALTER TABLE "user_learning_profile" ALTER COLUMN "level_self_assign_by_language" SET DEFAULT '{"en":2,"es":2,"fr":2,"ja":2}'::jsonb;--> statement-breakpoint
ALTER TABLE "user_learning_profile" ALTER COLUMN "level_self_assign_by_language" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user_learning_profile" DROP CONSTRAINT "level_check";--> statement-breakpoint

DELETE FROM "user_learning_profile"
WHERE ("user_id", "language") IN (
	SELECT "user_id", "language"
	FROM (
		SELECT
			"user_id",
			"language",
			ROW_NUMBER() OVER (PARTITION BY "user_id" ORDER BY "created_at", "language") AS "row_number"
		FROM "user_learning_profile"
	) AS "ranked_profiles"
	WHERE "row_number" > 1
);--> statement-breakpoint

ALTER TABLE "user_learning_profile" DROP CONSTRAINT "user_learning_profile_user_id_language_pk";--> statement-breakpoint
ALTER TABLE "user_learning_profile" DROP COLUMN "language";--> statement-breakpoint
ALTER TABLE "user_learning_profile" DROP COLUMN "level_self_assign";--> statement-breakpoint
ALTER TABLE "user_learning_profile" RENAME COLUMN "level_self_assign_by_language" TO "level_self_assign";--> statement-breakpoint
ALTER TABLE "user_learning_profile" ADD PRIMARY KEY ("user_id");--> statement-breakpoint
ALTER TABLE "user_learning_profile" ADD CONSTRAINT "user_learning_profile_level_self_assign_check" CHECK (
	jsonb_typeof("level_self_assign") = 'object'
	AND "level_self_assign" ?& ARRAY['en', 'es', 'fr', 'ja']
	AND ("level_self_assign" - 'en' - 'es' - 'fr' - 'ja') = '{}'::jsonb
	AND ("level_self_assign"->'en') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
	AND ("level_self_assign"->'es') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
	AND ("level_self_assign"->'fr') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
	AND ("level_self_assign"->'ja') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
);
