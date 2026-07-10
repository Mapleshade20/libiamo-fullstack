DELETE FROM "task"
WHERE "template_id" IN (SELECT "id" FROM "template" WHERE "interaction_type" = 'translate');
--> statement-breakpoint
DELETE FROM "template_variant"
WHERE "template_id" IN (SELECT "id" FROM "template" WHERE "interaction_type" = 'translate');
--> statement-breakpoint
DROP TABLE "translation_attempt";
--> statement-breakpoint
DELETE FROM "template_contribution" WHERE "interaction_type" = 'translate';
--> statement-breakpoint
DELETE FROM "template" WHERE "interaction_type" = 'translate';
--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "translation_reference" jsonb;
--> statement-breakpoint
ALTER TABLE "template_contribution" ADD COLUMN "translation_reference" jsonb;
--> statement-breakpoint
ALTER TABLE "template" DROP COLUMN "translation_base";
--> statement-breakpoint
ALTER TABLE "template_contribution" DROP COLUMN "translation_base";
--> statement-breakpoint
CREATE TABLE "translation_source_set" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"source_language" text NOT NULL,
	"prompt_language" text NOT NULL,
	"reference_paragraphs" jsonb NOT NULL,
	"context" text NOT NULL,
	"content_fingerprint" text NOT NULL,
	"prompt_version" text NOT NULL,
	"candidates" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_attempt" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_set_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"evaluation" jsonb,
	"submitted_at" timestamp,
	"evaluated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "translation_answer" (
	"attempt_id" integer NOT NULL,
	"paragraph_index" integer NOT NULL,
	"translation" text DEFAULT '' NOT NULL,
	"candidate_index" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translation_answer_attempt_id_paragraph_index_pk" PRIMARY KEY("attempt_id", "paragraph_index"),
	CONSTRAINT "translation_answer_paragraph_index_check" CHECK ("translation_answer"."paragraph_index" >= 0),
	CONSTRAINT "translation_answer_candidate_index_check" CHECK ("translation_answer"."candidate_index" >= 0 AND "translation_answer"."candidate_index" <= 2)
);
--> statement-breakpoint
ALTER TABLE "translation_source_set" ADD CONSTRAINT "translation_source_set_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD CONSTRAINT "translation_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_attempt" ADD CONSTRAINT "translation_attempt_source_set_id_translation_source_set_id_fk" FOREIGN KEY ("source_set_id") REFERENCES "public"."translation_source_set"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "translation_answer" ADD CONSTRAINT "translation_answer_attempt_id_translation_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."translation_attempt"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "translation_source_set_template_prompt_fingerprint_idx" ON "translation_source_set" USING btree ("template_id", "prompt_language", "content_fingerprint");
--> statement-breakpoint
CREATE INDEX "translation_source_set_template_idx" ON "translation_source_set" USING btree ("template_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "translation_attempt_user_source_set_idx" ON "translation_attempt" USING btree ("user_id", "source_set_id");
--> statement-breakpoint
CREATE INDEX "translation_attempt_user_idx" ON "translation_attempt" USING btree ("user_id");
