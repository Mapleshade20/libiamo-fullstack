import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {} as Record<string, string | undefined>,
}));

vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

const { mockDb, mockInsertValues, mockInsertReturning, updates, lockedRows } = vi.hoisted(() => {
	const updates: { set: Record<string, unknown>; inTransaction: boolean }[] = [];
	const updateReturning: unknown[][] = [];
	const lockedRows: unknown[][] = [];
	const mockInsertReturning = vi.fn();
	const mockInsertValues = vi.fn(() => ({
		onConflictDoNothing: vi.fn(() => ({
			returning: mockInsertReturning,
		})),
	}));

	const update = (inTransaction: boolean) =>
		vi.fn(() => ({
			set: (set: Record<string, unknown>) => {
				updates.push({ set, inTransaction });
				const rows = updateReturning.shift() ?? [];
				const where = Object.assign(Promise.resolve(rows), { returning: () => Promise.resolve(rows) });
				return { where: () => where };
			},
		}));

	const tx = {
		select: () => ({
			from: () => ({ where: () => ({ for: (mode: string) => (mode === "update" ? Promise.resolve(lockedRows.shift() ?? []) : []) }) }),
		}),
		update: update(true),
	};

	const mockDb = {
		query: {
			user: { findFirst: vi.fn() },
			userApiKey: { findFirst: vi.fn() },
			userQuota: { findFirst: vi.fn() },
		},
		insert: vi.fn(() => ({ values: mockInsertValues })),
		update: update(false),
		transaction: vi.fn(async (run: (transaction: typeof tx) => unknown) => run(tx)),
		updateReturning,
	};
	return { mockDb, mockInsertValues, mockInsertReturning, updates, lockedRows };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-03T12:00:00Z");

const row = (overrides: Record<string, unknown> = {}) => ({
	trialTokensLeft: 50_000,
	trialTokensTotal: 50_000,
	trialTokensReleased: 50_000,
	trialReleaseStartedAt: new Date(NOW.getTime() - 10 * DAY),
	...overrides,
});

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
	delete mockEnv.TRIAL_TOKEN_BUDGET;
	delete mockEnv.TRIAL_TOKEN_HOLD;
	updates.length = 0;
	lockedRows.length = 0;
	mockDb.updateReturning.length = 0;
	mockDb.query.userQuota.findFirst.mockResolvedValue(undefined);
	mockDb.query.user.findFirst.mockResolvedValue({ createdAt: NOW, email: "learner@gmail.com" });
});

describe("getTrialTokenBudget", () => {
	it("uses the fallback budget when env is unset", async () => {
		const { getTrialTokenBudget } = await import("$lib/server/account/trial-quota");

		expect(getTrialTokenBudget()).toBe(50_000);
	});

	it("uses TRIAL_TOKEN_BUDGET when env is set", async () => {
		mockEnv.TRIAL_TOKEN_BUDGET = "75000";
		const { getTrialTokenBudget } = await import("$lib/server/account/trial-quota");

		expect(getTrialTokenBudget()).toBe(75_000);
	});

	it("rejects invalid TRIAL_TOKEN_BUDGET values", async () => {
		mockEnv.TRIAL_TOKEN_BUDGET = "0";
		const { getTrialTokenBudget } = await import("$lib/server/account/trial-quota");

		expect(() => getTrialTokenBudget()).toThrow("TRIAL_TOKEN_BUDGET must be a positive integer");
	});
});

describe("getTrialQuotaBalance", () => {
	it("keeps an existing persisted quota even when env changes", async () => {
		mockEnv.TRIAL_TOKEN_BUDGET = "75000";
		mockDb.query.userQuota.findFirst.mockResolvedValueOnce(row({ trialTokensLeft: 123 }));
		const { getTrialQuotaBalance } = await import("$lib/server/account/trial-quota");

		await expect(getTrialQuotaBalance("user-1")).resolves.toEqual({
			trialTokensLeft: 123,
			trialTokensTotal: 50_000,
			trialTokensReleased: 50_000,
			trialNextReleaseAt: null,
		});
		expect(mockDb.insert).not.toHaveBeenCalled();
		expect(updates).toEqual([]);
	});

	it("grants a new account the first third, timed from sign-up", async () => {
		mockEnv.TRIAL_TOKEN_BUDGET = "75000";
		const signedUp = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
		mockDb.query.user.findFirst.mockResolvedValueOnce({ createdAt: signedUp, email: "j.ohn+1@gmail.com" });
		mockInsertReturning.mockResolvedValueOnce([
			row({ trialTokensLeft: 25_000, trialTokensTotal: 75_000, trialTokensReleased: 25_000, trialReleaseStartedAt: signedUp }),
		]);
		const { getTrialQuotaBalance } = await import("$lib/server/account/trial-quota");

		await expect(getTrialQuotaBalance("user-1")).resolves.toEqual({
			trialTokensLeft: 25_000,
			trialTokensTotal: 75_000,
			trialTokensReleased: 25_000,
			trialNextReleaseAt: new Date(signedUp.getTime() + DAY),
		});
		expect(mockInsertValues).toHaveBeenCalledWith({
			userId: "user-1",
			trialTokensLeft: 25_000,
			trialTokensTotal: 75_000,
			trialTokensReleased: 25_000,
			trialReleaseStartedAt: signedUp,
			trialEmailKey: "john@gmail.com",
		});
	});

	it("gives no grant to an alias of a mailbox that already has one", async () => {
		// The keyed insert hits the mailbox's unique key, and this user has no row of their own yet.
		mockInsertReturning.mockResolvedValueOnce([]);
		mockInsertReturning.mockImplementationOnce(async () => {
			const values = (mockInsertValues.mock.calls.at(-1) as unknown[])[0] as Record<string, unknown>;
			return [row({ ...values })];
		});
		const { getTrialQuotaBalance } = await import("$lib/server/account/trial-quota");

		await expect(getTrialQuotaBalance("user-2")).resolves.toEqual({
			trialTokensLeft: 0,
			trialTokensTotal: 0,
			trialTokensReleased: 0,
			trialNextReleaseAt: null,
		});
		expect(mockInsertValues).toHaveBeenLastCalledWith(expect.not.objectContaining({ trialEmailKey: expect.anything() }));
	});

	it("returns the row a concurrent request created instead of withholding the grant", async () => {
		mockInsertReturning.mockResolvedValueOnce([]);
		mockDb.query.userQuota.findFirst.mockResolvedValueOnce(undefined).mockResolvedValueOnce(row());
		const { getTrialQuotaBalance } = await import("$lib/server/account/trial-quota");

		await expect(getTrialQuotaBalance("user-1")).resolves.toMatchObject({ trialTokensTotal: 50_000 });
		expect(mockInsertValues).toHaveBeenCalledTimes(1);
	});

	it("adds the parts that came due since the last read", async () => {
		const startedAt = new Date(NOW.getTime() - DAY - 1);
		mockDb.query.userQuota.findFirst.mockResolvedValueOnce(
			row({ trialTokensLeft: 100, trialTokensReleased: 16_666, trialReleaseStartedAt: startedAt }),
		);
		mockDb.updateReturning.push([row({ trialTokensLeft: 16_767, trialTokensReleased: 33_333, trialReleaseStartedAt: startedAt })]);
		const { getTrialQuotaBalance } = await import("$lib/server/account/trial-quota");

		await expect(getTrialQuotaBalance("user-1")).resolves.toMatchObject({ trialTokensLeft: 16_767, trialTokensReleased: 33_333 });
		expect(updates).toHaveLength(1);
		expect(updates[0].set).toMatchObject({ trialTokensReleased: 33_333 });
	});
});

describe("reserveTrialQuota", () => {
	it("holds the configured amount under a row lock", async () => {
		mockEnv.TRIAL_TOKEN_HOLD = "3000";
		mockDb.query.userQuota.findFirst.mockResolvedValueOnce(row());
		lockedRows.push([{ trialTokensLeft: 10_000, trialTokensTotal: 50_000 }]);
		const { reserveTrialQuota } = await import("$lib/server/account/trial-quota");

		await expect(reserveTrialQuota("user-1")).resolves.toEqual({ userId: "user-1", tokens: 3_000 });
		expect(updates).toEqual([{ set: expect.objectContaining({ trialTokensLeft: 7_000 }), inTransaction: true }]);
	});

	it("holds only what is left when the balance is smaller than a hold", async () => {
		mockDb.query.userQuota.findFirst.mockResolvedValueOnce(row());
		lockedRows.push([{ trialTokensLeft: 500, trialTokensTotal: 50_000 }]);
		const { reserveTrialQuota } = await import("$lib/server/account/trial-quota");

		await expect(reserveTrialQuota("user-1")).resolves.toEqual({ userId: "user-1", tokens: 500 });
		expect(updates[0].set).toMatchObject({ trialTokensLeft: 0 });
	});

	it("refuses a call while an overspend leaves the balance in debt", async () => {
		mockDb.query.userQuota.findFirst.mockResolvedValueOnce(row({ trialTokensLeft: -900 }));
		lockedRows.push([{ trialTokensLeft: -900, trialTokensTotal: 50_000 }]);
		const { reserveTrialQuota, TrialQuotaExhaustedError } = await import("$lib/server/account/trial-quota");

		await expect(reserveTrialQuota("user-1")).rejects.toBeInstanceOf(TrialQuotaExhaustedError);
		expect(updates).toEqual([]);
	});

	it("refuses a call once holds have emptied the balance", async () => {
		mockDb.query.userQuota.findFirst.mockResolvedValueOnce(row());
		lockedRows.push([{ trialTokensLeft: 0, trialTokensTotal: 50_000 }]);
		const { reserveTrialQuota, TrialQuotaExhaustedError } = await import("$lib/server/account/trial-quota");

		await expect(reserveTrialQuota("user-1")).rejects.toBeInstanceOf(TrialQuotaExhaustedError);
		expect(updates).toEqual([]);
	});
});

describe("settleTrialQuota", () => {
	it("reports the usage and balance after the hold is settled", async () => {
		mockDb.updateReturning.push([row({ trialTokensLeft: 4_000 })]);
		const { settleTrialQuota } = await import("$lib/server/account/trial-quota");

		await expect(settleTrialQuota({ userId: "user-1", tokens: 4_096 }, 11.2, false)).resolves.toMatchObject({
			trialTokensLeft: 4_000,
			trialTokensUsed: 12,
			trialUsageEstimated: false,
			trialQuotaWarning: "low",
		});
	});

	it("reports a debt as an empty balance", async () => {
		mockDb.updateReturning.push([row({ trialTokensLeft: -908 })]);
		const { settleTrialQuota } = await import("$lib/server/account/trial-quota");

		await expect(settleTrialQuota({ userId: "user-1", tokens: 4_096 }, 9_000, false)).resolves.toMatchObject({
			trialTokensLeft: 0,
			trialQuotaWarning: "depleted",
		});
	});
});
