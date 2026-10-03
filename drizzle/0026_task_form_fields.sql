ALTER TABLE "task" DROP CONSTRAINT "task_kind_fields_check";--> statement-breakpoint
ALTER TABLE "task_contribution" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_kind_fields_check" CHECK (CASE "task"."interaction_type"
				WHEN 'chat' THEN "task"."urgency" IS NOT NULL AND "task"."opening_state" IS NOT NULL AND "task"."reference_paragraphs" IS NULL AND "task"."translation_context" IS NULL
				ELSE "task"."urgency" IS NULL AND "task"."max_turns" IS NULL AND "task"."agent_prompt" IS NULL AND "task"."opening_state" IS NULL
					AND "task"."reference_paragraphs" IS NOT NULL AND "task"."translation_context" IS NOT NULL
					AND jsonb_typeof("task"."reference_paragraphs") = 'array' AND jsonb_array_length("task"."reference_paragraphs") > 0
					AND length(btrim("task"."translation_context")) > 0
			END);--> statement-breakpoint
ALTER TABLE "task_contribution" DROP COLUMN "materials_md";--> statement-breakpoint
ALTER TABLE "task_contribution" DROP COLUMN "tags";
