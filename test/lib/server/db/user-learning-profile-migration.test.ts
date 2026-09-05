import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../../drizzle/0018_consolidate_user_learning_profiles.sql", import.meta.url), "utf8");

describe("user learning profile consolidation migration", () => {
	it("preserves every saved language level before removing per-language rows", () => {
		const aggregation = migration.indexOf('WITH "aggregated_profiles"');
		const duplicateRemoval = migration.indexOf('DELETE FROM "user_learning_profile"');
		const languageRemoval = migration.indexOf('DROP COLUMN "language"');

		expect(aggregation).toBeGreaterThan(-1);
		expect(aggregation).toBeLessThan(duplicateRemoval);
		expect(duplicateRemoval).toBeLessThan(languageRemoval);
		for (const language of ["en", "es", "fr", "ja"]) {
			expect(migration).toContain(`FILTER (WHERE "language" = '${language}')`);
		}
	});

	it("creates a complete default profile for users without legacy rows", () => {
		expect(migration).toContain('FROM "user"');
		expect(migration).toContain("WHERE NOT EXISTS");
		expect(migration).toContain(`'{"en":2,"es":2,"fr":2,"ja":2}'::jsonb`);
	});

	it("makes user identity unique and validates the complete language map", () => {
		expect(migration).toContain('ADD PRIMARY KEY ("user_id")');
		expect(migration).toContain("\"level_self_assign\" ?& ARRAY['en', 'es', 'fr', 'ja']");
		expect(migration).toContain(`("level_self_assign" - 'en' - 'es' - 'fr' - 'ja') = '{}'::jsonb`);
	});
});
