CREATE TABLE "llm_dataset" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"recipe_id" text NOT NULL,
	"judge_rubric" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_dataset_case" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset_id" integer NOT NULL,
	"recipe_version" integer NOT NULL,
	"input" jsonb NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"source_trace_id" uuid,
	"source_user_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_override" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"recipe_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"slots" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_ref" text,
	"temperature" double precision,
	"reasoning_effort" text,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_override_user_recipe_unique" UNIQUE("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "llm_rating" (
	"id" serial PRIMARY KEY NOT NULL,
	"trace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"vote" smallint NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_rating_trace_user_unique" UNIQUE("trace_id","user_id"),
	CONSTRAINT "llm_rating_vote_check" CHECK ("llm_rating"."vote" IN (-1, 0, 1))
);
--> statement-breakpoint
CREATE TABLE "llm_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset_id" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"variants" jsonb NOT NULL,
	"repeats" integer DEFAULT 1 NOT NULL,
	"judge" jsonb,
	"created_by" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_run_cell" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"case_id" integer NOT NULL,
	"variant_key" text NOT NULL,
	"repeat_index" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"lease_until" timestamp with time zone,
	"claim_token" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"trace_id" uuid,
	"judge" jsonb,
	"error" text,
	"completed_at" timestamp with time zone,
	CONSTRAINT "llm_run_cell_unique" UNIQUE("run_id","case_id","variant_key","repeat_index"),
	CONSTRAINT "llm_run_cell_status_check" CHECK ("llm_run_cell"."status" IN ('pending', 'running', 'done', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "llm_trace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"origin" text NOT NULL,
	"recipe_id" text NOT NULL,
	"recipe_version" integer NOT NULL,
	"task_id" integer,
	"session_id" integer,
	"translation_attempt_id" integer,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"variant" jsonb,
	"override_id" integer,
	"run_id" integer,
	"messages" jsonb NOT NULL,
	"options" jsonb NOT NULL,
	"attempts" jsonb NOT NULL,
	"output" jsonb,
	"output_text" text,
	"error" jsonb,
	"route" jsonb,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_trace_origin_check" CHECK ("llm_trace"."origin" IN ('app', 'override', 'lab')),
	CONSTRAINT "llm_trace_status_check" CHECK ("llm_trace"."status" IN ('ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE "llm_trace_opt_out" (
	"user_id" text PRIMARY KEY NOT NULL,
	"opted_out_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_dataset" ADD CONSTRAINT "llm_dataset_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_dataset_case" ADD CONSTRAINT "llm_dataset_case_dataset_id_llm_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."llm_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_dataset_case" ADD CONSTRAINT "llm_dataset_case_source_trace_id_llm_trace_id_fk" FOREIGN KEY ("source_trace_id") REFERENCES "public"."llm_trace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_dataset_case" ADD CONSTRAINT "llm_dataset_case_source_user_id_user_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_dataset_case" ADD CONSTRAINT "llm_dataset_case_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_override" ADD CONSTRAINT "llm_override_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_rating" ADD CONSTRAINT "llm_rating_trace_id_llm_trace_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."llm_trace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_rating" ADD CONSTRAINT "llm_rating_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_run" ADD CONSTRAINT "llm_run_dataset_id_llm_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."llm_dataset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_run" ADD CONSTRAINT "llm_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_run_cell" ADD CONSTRAINT "llm_run_cell_run_id_llm_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."llm_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_run_cell" ADD CONSTRAINT "llm_run_cell_case_id_llm_dataset_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."llm_dataset_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_run_cell" ADD CONSTRAINT "llm_run_cell_trace_id_llm_trace_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."llm_trace"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_trace" ADD CONSTRAINT "llm_trace_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_trace" ADD CONSTRAINT "llm_trace_override_id_llm_override_id_fk" FOREIGN KEY ("override_id") REFERENCES "public"."llm_override"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_trace" ADD CONSTRAINT "llm_trace_run_id_llm_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."llm_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_trace_opt_out" ADD CONSTRAINT "llm_trace_opt_out_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_dataset_case_dataset_idx" ON "llm_dataset_case" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "llm_run_cell_status_idx" ON "llm_run_cell" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "llm_trace_created_idx" ON "llm_trace" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "llm_trace_user_task_idx" ON "llm_trace" USING btree ("user_id","task_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_trace_recipe_idx" ON "llm_trace" USING btree ("recipe_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_trace_run_idx" ON "llm_trace" USING btree ("run_id");
