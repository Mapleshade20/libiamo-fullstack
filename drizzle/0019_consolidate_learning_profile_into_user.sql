ALTER TABLE "user" ADD COLUMN "level_self_assign" jsonb DEFAULT '{"en":2,"es":2,"fr":2,"ja":2}'::jsonb NOT NULL;--> statement-breakpoint

UPDATE "user"
SET "level_self_assign" = "profile"."level_self_assign"
FROM "user_learning_profile" AS "profile"
WHERE "profile"."user_id" = "user"."id";--> statement-breakpoint

ALTER TABLE "user" ADD CONSTRAINT "user_level_self_assign_check" CHECK (
	jsonb_typeof("user"."level_self_assign") = 'object'
	AND "user"."level_self_assign" ?& ARRAY['en', 'es', 'fr', 'ja']
	AND ("user"."level_self_assign" - 'en' - 'es' - 'fr' - 'ja') = '{}'::jsonb
	AND ("user"."level_self_assign"->'en') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
	AND ("user"."level_self_assign"->'es') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
	AND ("user"."level_self_assign"->'fr') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
	AND ("user"."level_self_assign"->'ja') IN ('1'::jsonb, '2'::jsonb, '3'::jsonb)
);--> statement-breakpoint

DROP TABLE "user_learning_profile" CASCADE;
