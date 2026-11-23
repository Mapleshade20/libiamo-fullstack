ALTER TABLE "llm_call" ADD COLUMN "reading_id" uuid;--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_reading_id_reading_id_fk" FOREIGN KEY ("reading_id") REFERENCES "public"."reading"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_call_reading_idx" ON "llm_call" USING btree ("reading_id");--> statement-breakpoint
ALTER TABLE "exchange" DROP COLUMN "last_processed_user_message_id";--> statement-breakpoint
ALTER TABLE "note" DROP COLUMN "also";