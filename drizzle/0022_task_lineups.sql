-- Templates, variants and per-date task copies become one static task per scenario, and distribution
-- moves to lineups. Nothing is publicly released yet: authored template content is converted, while
-- all learner activity is test data and is wiped.
TRUNCATE "review_log", "note", "translation_answer", "translation_attempt", "translation_source_set", "agent_delivery", "session_message", "agent_response_batch", "practice_session", "streak_day", "user_streak", "template_contribution", "task" RESTART IDENTITY CASCADE;--> statement-breakpoint
DROP TABLE "task" CASCADE;--> statement-breakpoint
CREATE TYPE "public"."lineup_kind" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."lineup_origin" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TABLE "task" (
	"id" serial PRIMARY KEY NOT NULL,
	"interaction_type" "interaction_type" NOT NULL,
	"language" "language_code" NOT NULL,
	"ui" "ui_variant" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"difficulty" integer NOT NULL,
	"title" text NOT NULL,
	"short_objective" text,
	"description" text,
	"objectives" text[],
	"materials_md" text,
	"tags" text[],
	"estimated_words" integer,
	"urgency" "urgency",
	"max_turns" integer,
	"agent_prompt" text,
	"opening_state" jsonb,
	"reference_paragraphs" jsonb,
	"translation_context" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"legacy_template_id" integer,
	CONSTRAINT "task_difficulty_check" CHECK ("task"."difficulty" BETWEEN 1 AND 3),
	CONSTRAINT "task_max_turns_check" CHECK ("task"."max_turns" IS NULL OR "task"."max_turns" > 0),
	CONSTRAINT "task_estimated_words_check" CHECK ("task"."estimated_words" IS NULL OR "task"."estimated_words" > 0),
	CONSTRAINT "task_translator_ui_check" CHECK (("task"."interaction_type" = 'translate') = ("task"."ui" = 'translator')),
	CONSTRAINT "task_kind_fields_check" CHECK (CASE "task"."interaction_type"
				WHEN 'chat' THEN "task"."urgency" IS NOT NULL AND "task"."opening_state" IS NOT NULL AND "task"."reference_paragraphs" IS NULL AND "task"."translation_context" IS NULL
				ELSE "task"."urgency" IS NULL AND "task"."max_turns" IS NULL AND "task"."agent_prompt" IS NULL AND "task"."opening_state" IS NULL
					AND jsonb_typeof("task"."reference_paragraphs") = 'array' AND jsonb_array_length("task"."reference_paragraphs") > 0
					AND length(btrim("task"."translation_context")) > 0
			END)
);
--> statement-breakpoint
CREATE TABLE "lineup" (
	"id" serial PRIMARY KEY NOT NULL,
	"language" "language_code" NOT NULL,
	"kind" "lineup_kind" NOT NULL,
	"starts_on" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineup_rotation" (
	"task_id" integer PRIMARY KEY NOT NULL,
	"kind" "lineup_kind" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineup_task" (
	"lineup_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"position" integer NOT NULL,
	"origin" "lineup_origin" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lineup_task_lineup_id_task_id_pk" PRIMARY KEY("lineup_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "task_contribution" (
	"id" serial PRIMARY KEY NOT NULL,
	"interaction_type" "interaction_type" NOT NULL,
	"language" "language_code" NOT NULL,
	"ui" "ui_variant" NOT NULL,
	"title" text NOT NULL,
	"short_objective" text,
	"description" text,
	"objectives" text[],
	"materials_md" text,
	"tags" text[],
	"urgency" "urgency",
	"agent_prompt" text,
	"opening_state" jsonb,
	"reference_paragraphs" jsonb,
	"translation_context" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text NOT NULL,
	"reviewed_by" text,
	"review_notes" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE FUNCTION pg_temp.resolve_template_slots(input text, slots jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
	result text := input;
	slot record;
BEGIN
	IF result IS NULL OR slots IS NULL OR jsonb_typeof(slots) <> 'object' THEN
		RETURN result;
	END IF;
	FOR slot IN SELECT key, value FROM jsonb_each_text(slots) LOOP
		result := replace(result, '{{' || slot.key || '}}', coalesce(slot.value, ''));
	END LOOP;
	RETURN result;
END;
$$;--> statement-breakpoint
-- Every chat variant was a distinct scenario (its own opening state and matching slot values), so
-- each one becomes a task with its slots written into the text.
INSERT INTO "task" ("interaction_type", "language", "ui", "is_active", "difficulty", "title", "short_objective", "description", "objectives", "materials_md", "tags", "estimated_words", "urgency", "max_turns", "agent_prompt", "opening_state", "created_by", "created_at", "updated_at", "legacy_template_id")
SELECT
	'chat',
	t."language",
	t."ui",
	t."is_active" AND coalesce(v."is_active", false),
	t."difficulty",
	pg_temp.resolve_template_slots(t."title_base", v."slot_values"),
	pg_temp.resolve_template_slots(t."short_objective_base", v."slot_values"),
	pg_temp.resolve_template_slots(t."description_base", v."slot_values"),
	CASE WHEN cardinality(t."objectives_base") > 0 THEN ARRAY(
		SELECT pg_temp.resolve_template_slots(objective, v."slot_values")
		FROM unnest(t."objectives_base") WITH ORDINALITY AS objectives(objective, position)
		ORDER BY position
	) END,
	pg_temp.resolve_template_slots(t."materials_md", v."slot_values"),
	t."tags",
	CASE WHEN t."estimated_words" > 0 THEN t."estimated_words" END,
	coalesce(t."urgency", 'high'),
	CASE WHEN t."max_turns" > 0 THEN t."max_turns" END,
	pg_temp.resolve_template_slots(t."agent_prompt_base", v."slot_values"),
	coalesce(v."opening_state", '{}'::jsonb),
	t."created_by",
	t."created_at",
	greatest(t."updated_at", coalesce(v."updated_at", t."updated_at")),
	t."id"
FROM "template" t
LEFT JOIN "template_variant" v ON v."template_id" = t."id"
WHERE t."interaction_type" = 'chat' AND t."ui" <> 'translator'
ORDER BY t."id", v."id";--> statement-breakpoint
INSERT INTO "task" ("interaction_type", "language", "ui", "is_active", "difficulty", "title", "description", "objectives", "tags", "estimated_words", "reference_paragraphs", "translation_context", "created_by", "created_at", "updated_at", "legacy_template_id")
SELECT
	'translate',
	t."language",
	'translator',
	t."is_active",
	t."difficulty",
	t."title_base",
	t."description_base",
	CASE WHEN cardinality(t."objectives_base") > 0 THEN t."objectives_base" END,
	t."tags",
	CASE WHEN t."estimated_words" > 0 THEN t."estimated_words" END,
	t."translation_reference",
	btrim(t."agent_prompt_base"),
	t."created_by",
	t."created_at",
	t."updated_at",
	t."id"
FROM "template" t
WHERE t."interaction_type" = 'translate'
	AND jsonb_typeof(t."translation_reference") = 'array' AND jsonb_array_length(t."translation_reference") > 0
	AND length(btrim(coalesce(t."agent_prompt_base", ''))) > 0
ORDER BY t."id";--> statement-breakpoint
INSERT INTO "lineup_rotation" ("task_id", "kind")
SELECT task."id", t."cadence"::text::"lineup_kind"
FROM "task" task
JOIN "template" t ON t."id" = task."legacy_template_id"
WHERE task."interaction_type" = 'chat' AND task."is_active" AND t."cadence" IN ('daily', 'weekly');--> statement-breakpoint
ALTER TABLE "task" DROP COLUMN "legacy_template_id";--> statement-breakpoint
DROP FUNCTION pg_temp.resolve_template_slots(text, jsonb);--> statement-breakpoint
DROP TABLE "template_contribution" CASCADE;--> statement-breakpoint
DROP TABLE "template_variant" CASCADE;--> statement-breakpoint
DROP TABLE "template" CASCADE;--> statement-breakpoint
DROP INDEX "practice_session_user_task_idx";--> statement-breakpoint
ALTER TABLE "practice_session" DROP COLUMN "agent_prompt_snapshot";--> statement-breakpoint
ALTER TABLE "practice_session" DROP COLUMN "urgency";--> statement-breakpoint
ALTER TABLE "practice_session" DROP COLUMN "max_turns_snapshot";--> statement-breakpoint
ALTER TABLE "practice_session" ADD COLUMN "lineup_id" integer;--> statement-breakpoint
ALTER TABLE "translation_attempt" DROP CONSTRAINT "translation_attempt_source_set_id_translation_source_set_id_fk";--> statement-breakpoint
DROP INDEX "translation_attempt_active_user_source_set_idx";--> statement-breakpoint
DROP INDEX "translation_attempt_user_idx";--> statement-breakpoint
DROP INDEX "translation_source_set_template_prompt_fingerprint_idx";--> statement-breakpoint
DROP INDEX "translation_source_set_template_idx";--> statement-breakpoint
ALTER TABLE "translation_source_set" DROP COLUMN "template_id";--> statement-breakpoint
ALTER TABLE "translation_source_set" ADD COLUMN "task_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD COLUMN "task_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD COLUMN "lineup_id" integer;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_rotation" ADD CONSTRAINT "lineup_rotation_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_task" ADD CONSTRAINT "lineup_task_lineup_id_lineup_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_task" ADD CONSTRAINT "lineup_task_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_contribution" ADD CONSTRAINT "task_contribution_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_contribution" ADD CONSTRAINT "task_contribution_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_lineup_task_fk" FOREIGN KEY ("lineup_id","task_id") REFERENCES "public"."lineup_task"("lineup_id","task_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_source_set" ADD CONSTRAINT "translation_source_set_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_source_set" ADD CONSTRAINT "translation_source_set_id_task_key" UNIQUE("id","task_id");--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD CONSTRAINT "translation_attempt_source_set_task_fk" FOREIGN KEY ("source_set_id","task_id") REFERENCES "public"."translation_source_set"("id","task_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD CONSTRAINT "translation_attempt_lineup_task_fk" FOREIGN KEY ("lineup_id","task_id") REFERENCES "public"."lineup_task"("lineup_id","task_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_session" ADD CONSTRAINT "practice_session_user_task_lineup_key" UNIQUE NULLS NOT DISTINCT("user_id","task_id","lineup_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lineup_language_kind_starts_on_idx" ON "lineup" USING btree ("language","kind","starts_on");--> statement-breakpoint
CREATE INDEX "lineup_task_task_idx" ON "lineup_task" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_language_type_idx" ON "task" USING btree ("language","interaction_type");--> statement-breakpoint
CREATE INDEX "task_contribution_status_idx" ON "task_contribution" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "task_contribution_created_by_idx" ON "task_contribution" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "practice_session_task_idx" ON "practice_session" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_attempt_active_idx" ON "translation_attempt" USING btree ("user_id","source_set_id",coalesce("lineup_id", 0)) WHERE "translation_attempt"."workflow_phase" <> 'completed';--> statement-breakpoint
CREATE INDEX "translation_attempt_user_task_idx" ON "translation_attempt" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_source_set_task_prompt_fingerprint_idx" ON "translation_source_set" USING btree ("task_id","prompt_language","content_fingerprint");--> statement-breakpoint
DROP TYPE "public"."cadence";--> statement-breakpoint
DROP TYPE "public"."schedule_origin";
