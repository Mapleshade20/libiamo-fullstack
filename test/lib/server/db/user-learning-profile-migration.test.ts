import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../../drizzle/0018_consolidate_user_learning_profiles.sql", import.meta.url), "utf8");
const merge = readFileSync(new URL("../../../../drizzle/0019_consolidate_learning_profile_into_user.sql", import.meta.url), "utf8");

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

describe("learning profile merge into user migration", () => {
	it("copies saved levels onto user before dropping the profile table", () => {
		const addColumn = merge.indexOf('ALTER TABLE "user" ADD COLUMN "level_self_assign"');
		const backfill = merge.indexOf('FROM "user_learning_profile" AS "profile"');
		const drop = merge.indexOf('DROP TABLE "user_learning_profile"');

		expect(addColumn).toBeGreaterThan(-1);
		expect(addColumn).toBeLessThan(backfill);
		expect(backfill).toBeLessThan(drop);
	});

	it("keeps users without a legacy row on the default level map", () => {
		expect(merge).toContain(`DEFAULT '{"en":2,"es":2,"fr":2,"ja":2}'::jsonb NOT NULL`);
	});

	it("re-establishes the language map check on user", () => {
		const constraint = merge.indexOf('ADD CONSTRAINT "user_level_self_assign_check"');
		const drop = merge.indexOf('DROP TABLE "user_learning_profile"');

		expect(constraint).toBeGreaterThan(-1);
		expect(constraint).toBeLessThan(drop);
		expect(merge).toContain("\"user\".\"level_self_assign\" ?& ARRAY['en', 'es', 'fr', 'ja']");
	});
});
