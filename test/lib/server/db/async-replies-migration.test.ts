import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../../drizzle/0010_async_agent_replies.sql", import.meta.url), "utf8");
const abandonmentMigration = readFileSync(new URL("../../../../drizzle/0015_abandon_expired_sessions.sql", import.meta.url), "utf8");

describe("async replies migration", () => {
	it("maps legacy slow records before rebuilding the interaction enum", () => {
		const templateBackfill = migration.indexOf('UPDATE "template"');
		const enumDrop = migration.indexOf('DROP TYPE "public"."interaction_type"');
		expect(templateBackfill).toBeGreaterThan(-1);
		expect(templateBackfill).toBeLessThan(enumDrop);
		expect(migration).toContain("WHEN \"interaction_type\" = 'slow' THEN 'low'");
		expect(migration).toContain("CASE WHEN \"interaction_type\" = 'slow' THEN 'chat'");
	});

	it("backfills task and session timing before setting required columns", () => {
		const taskBackfill = migration.indexOf('UPDATE "task"');
		const taskNotNull = migration.indexOf('ALTER TABLE "task" ALTER COLUMN "urgency" SET NOT NULL');
		const sessionBackfill = migration.indexOf('UPDATE "practice_session"');
		const sessionNotNull = migration.indexOf('ALTER TABLE "practice_session" ALTER COLUMN "urgency" SET NOT NULL');

		expect(taskBackfill).toBeLessThan(taskNotNull);
		expect(sessionBackfill).toBeLessThan(sessionNotNull);
		expect(migration).toContain("CURRENT_TIMESTAMP + make_interval");
		expect(migration).toContain("WHEN 'high'::\"urgency\" THEN 43200");
		expect(migration).toContain("ELSE 604800");
	});

	it("materializes an urgency for tasks whose template has none", () => {
		// Translate templates keep a NULL urgency, and the pre-existing manual
		// scheduling path never rejected them, so a historical task may point at one.
		// Every branch of the task backfill must therefore produce a non-NULL value
		// or the NOT NULL that follows aborts the whole migration.
		const taskBackfill = migration.slice(migration.indexOf('UPDATE "task"'), migration.indexOf('UPDATE "practice_session"'));
		expect(taskBackfill).toContain('COALESCE("template"."urgency", \'low\'::"urgency")');
		expect(taskBackfill).not.toMatch(/WHEN 'low'::"urgency" THEN 604800\s*\n\s*END/);
	});

	it("normalizes session expiry to 48 hours and removes follow-up exhaustion", () => {
		expect(abandonmentMigration).toContain('SET "max_session_age_seconds" = 172800');
		expect(abandonmentMigration).toContain('SET "expires_at" = "started_at" + make_interval(secs => 172800)');
		expect(abandonmentMigration).toContain("SET \"status\" = 'abandoned'");
		expect(abandonmentMigration).toContain("WHERE \"completion_reason\" = 'follow_up_exhausted'");
		expect(abandonmentMigration).toContain(
			"CREATE TYPE \"public\".\"session_completion_reason\" AS ENUM('user_requested', 'max_turns', 'max_session_age', 'terminated_abuse')",
		);
	});
});
