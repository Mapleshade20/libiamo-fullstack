import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../drizzle/0022_task_lineups.sql", import.meta.url), "utf8");

describe("task lineups migration", () => {
	it("converts authored templates into tasks before dropping them", () => {
		const firstConversion = migration.indexOf('INSERT INTO "task"');
		const rotation = migration.indexOf('INSERT INTO "lineup_rotation"');
		expect(firstConversion).toBeGreaterThan(-1);
		expect(rotation).toBeGreaterThan(firstConversion);
		for (const table of ["template", "template_variant", "template_contribution"]) {
			expect(migration.indexOf(`DROP TABLE "${table}"`)).toBeGreaterThan(rotation);
		}
	});

	it("resolves each variant's slot values into the task text", () => {
		expect(migration).toContain('pg_temp.resolve_template_slots(t."title_base", v."slot_values")');
		expect(migration).toContain('pg_temp.resolve_template_slots(t."agent_prompt_base", v."slot_values")');
	});
});
