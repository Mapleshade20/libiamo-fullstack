import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../../drizzle/0010_async_agent_replies.sql", import.meta.url), "utf8");

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
		expect(migration).toContain("WHEN 'low'::\"urgency\" THEN 604800");
	});
});
