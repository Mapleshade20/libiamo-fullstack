import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { type SQL, sql } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userQuota } from "$lib/server/db/schema";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		update: vi.fn(),
		query: { userQuota: { findFirst: vi.fn() } },
	},
}));

vi.mock("$env/dynamic/private", () => ({ env: {} }));
vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { getTrialQuotaBalance, refundTrialQuotaHold, settleTrialQuota } from "$lib/server/account/trial-quota";

const NOW = new Date("2026-10-03T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const hold = { userId: "user-1", tokens: 4_096 };
const dialect = new PgDialect();
let database: DatabaseSync;

function readQuota() {
	const row = database.prepare('SELECT * FROM "user_quota" WHERE "user_id" = ?').get(hold.userId);
	if (!row) throw new Error("Missing test quota");
	return {
		trialTokensLeft: Number(row.trial_tokens_left),
		trialTokensTotal: Number(row.trial_tokens_total),
		trialTokensReleased: Number(row.trial_tokens_released),
		trialReleaseStartedAt: new Date(Number(row.trial_release_started_at)),
	};
}

beforeEach(() => {
	vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
	database = new DatabaseSync(":memory:");
	// Execute the production SQL expressions, rather than duplicating their arithmetic in a mock.
	// This covers accounting order, not PostgreSQL row locking. GREATEST is registered so restoring
	// the old clamp fails on the balance assertion, not on SQLite's missing function.
	database.function("greatest", { varargs: true }, (...values) => Math.max(...values.map(Number)));
	database.exec(`CREATE TABLE user_quota (
		user_id TEXT PRIMARY KEY,
		trial_tokens_left INTEGER NOT NULL,
		trial_tokens_total INTEGER NOT NULL,
		trial_tokens_released INTEGER NOT NULL,
		trial_release_started_at INTEGER NOT NULL,
		updated_at INTEGER
	)`);
	// An 8192-token grant with two 4096-token calls already in flight.
	database.prepare("INSERT INTO user_quota VALUES (?, 0, 8192, 8192, ?, NULL)").run(hold.userId, NOW.getTime() - 3 * DAY);
	mockDb.query.userQuota.findFirst.mockImplementation(async () => readQuota());
	mockDb.update.mockImplementation((table: PgTable) => ({
		set: (values: Record<string, unknown>) => ({
			where: (condition: SQL) => {
				const assignments = Object.entries(values).map(([key, value]) => {
					const column = userQuota[key as keyof typeof userQuota.$inferSelect];
					return sql`${sql.identifier(column.name)} = ${value}`;
				});
				const query = dialect.sqlToQuery(sql`UPDATE ${table} SET ${sql.join(assignments, sql`, `)} WHERE ${condition}`);
				const bindings = Object.fromEntries(
					query.params.map((value, index) => [String(index + 1), value instanceof Date ? value.getTime() : (value as SQLInputValue)]),
				);
				const result = database.prepare(query.sql).run(bindings);
				return Object.assign(Promise.resolve(), {
					returning: async () => (result.changes ? [readQuota()] : []),
				});
			},
		}),
	}));
});

afterEach(() => {
	database?.close();
	vi.useRealTimers();
	vi.resetAllMocks();
});

describe("trial quota settlement accounting", () => {
	it.each([
		[9_000, 100, -908],
		[100, 9_000, -908],
		[5_000, 100, 3_092],
		[100, 5_000, 3_092],
	])("settles usages %i then %i to a stored balance of %i", async (first, second, expected) => {
		await settleTrialQuota(hold, first, false);
		const result = await settleTrialQuota(hold, second, false);

		expect(readQuota().trialTokensLeft).toBe(expected);
		expect(result.trialTokensLeft).toBe(Math.max(0, expected));
		await expect(getTrialQuotaBalance(hold.userId)).resolves.toMatchObject({ trialTokensLeft: Math.max(0, expected) });
	});

	it.each([
		["settle first", 9_000, -808],
		["refund first", 9_000, -808],
		["settle first", 5_000, 3_192],
		["refund first", 5_000, 3_192],
	] as const)("%s with usage %i leaves %i after the other call fails", async (order, usage, expected) => {
		if (order === "settle first") {
			await settleTrialQuota(hold, usage, false);
			await refundTrialQuotaHold(hold);
		} else {
			await refundTrialQuotaHold(hold);
			await settleTrialQuota(hold, usage, false);
		}

		expect(readQuota().trialTokensLeft).toBe(expected);
		await expect(getTrialQuotaBalance(hold.userId)).resolves.toMatchObject({ trialTokensLeft: Math.max(0, expected) });
	});

	it("pays the debt from the next release without releasing the same tokens twice", async () => {
		database.prepare("UPDATE user_quota SET trial_tokens_total = 24576, trial_release_started_at = ?").run(NOW.getTime() - DAY);
		await settleTrialQuota(hold, 9_000, false);
		await settleTrialQuota(hold, 100, false);
		expect(readQuota().trialTokensLeft).toBe(-908);

		await expect(getTrialQuotaBalance(hold.userId)).resolves.toMatchObject({ trialTokensLeft: 7_284, trialTokensReleased: 16_384 });
		await expect(getTrialQuotaBalance(hold.userId)).resolves.toMatchObject({ trialTokensLeft: 7_284, trialTokensReleased: 16_384 });
		expect(readQuota().trialTokensLeft).toBe(7_284);
	});
});
