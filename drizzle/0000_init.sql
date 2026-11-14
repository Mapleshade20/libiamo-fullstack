CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'learner' NOT NULL,
	"native_language" text,
	"learning_languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"active_language" text,
	"tutor_language" text DEFAULT 'native' NOT NULL,
	"weekly_goal" integer DEFAULT 3 NOT NULL,
	"time_zone" text,
	"help_improve" boolean DEFAULT true NOT NULL,
	"onboarded_at" timestamp with time zone,
	"pending_email" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('learner', 'admin')),
	CONSTRAINT "user_native_language_check" CHECK ("user"."native_language" is null or "user"."native_language" in ('en', 'ru', 'es', 'de', 'tr', 'fa', 'fr', 'ja', 'pt', 'zh-CN', 'vi', 'it', 'ar', 'pl', 'el', 'nl', 'id', 'ko')),
	CONSTRAINT "user_learning_languages_check" CHECK ("user"."learning_languages" <@ array['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh-CN', 'ru', 'ar', 'nl', 'tr', 'pl']::text[]),
	CONSTRAINT "user_active_language_check" CHECK ("user"."active_language" is null or "user"."active_language" = any("user"."learning_languages")),
	CONSTRAINT "user_tutor_language_check" CHECK ("user"."tutor_language" in ('native', 'target')),
	CONSTRAINT "user_weekly_goal_check" CHECK ("user"."weekly_goal" between 1 and 7),
	CONSTRAINT "user_onboarded_check" CHECK ("user"."onboarded_at" is null or ("user"."native_language" is not null and "user"."active_language" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_key" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_key_provider_check" CHECK ("user_key"."provider" in ('openrouter', 'deepseek', 'openai', 'glm'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_key" ADD CONSTRAINT "user_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_unique" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_user_provider_unique" ON "account" USING btree ("user_id","provider_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");