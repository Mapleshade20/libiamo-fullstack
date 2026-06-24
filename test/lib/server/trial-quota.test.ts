import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
	mockEnv: {} as Record<string, string | undefined>,
}));

vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

const { mockUserQuotaFindFirst, mockDbInsert, mockInsertValues, mockInsertReturning, mockDbUpdate } = vi.hoisted(() => {
	const mockInsertReturning = vi.fn();
	const mockInsertValues = vi.fn(() => ({
		onConflictDoNothing: vi.fn(() => ({
			returning: mockInsertReturning,
		})),
	}));
	const mockDbInsert = vi.fn(() => ({ values: mockInsertValues }));
	const mockDbUpdate = vi.fn(() => ({
		set: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(),
			})),
		})),
	}));

	return {
		mockUserQuotaFindFirst: vi.fn(),
		mockDbInsert,
		mockInsertValues,
		mockInsertReturning,
		mockDbUpdate,
	};
});

vi.mock("$lib/server/db", () => ({
	db: {
		query: {
			userApiKey: { findFirst: vi.fn() },
			userQuota: { findFirst: mockUserQuotaFindFirst },
		},
		insert: mockDbInsert,
		update: mockDbUpdate,
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	delete mockEnv.TRIAL_TOKEN_BUDGET;
	mockUserQuotaFindFirst.mockResolvedValue(undefined);
	mockInsertReturning.mockResolvedValue([{ trialTokensLeft: 50_000, trialTokensTotal: 50_000 }]);
});

describe("getTrialTokenBudget", () => {
	it("uses the fallback budget when env is unset", async () => {
		const { getTrialTokenBudget } = await import("$lib/server/trial-quota");

		expect(getTrialTokenBudget()).toBe(50_000);
	});

	it("uses TRIAL_TOKEN_BUDGET when env is set", async () => {
		mockEnv.TRIAL_TOKEN_BUDGET = "75000";
		const { getTrialTokenBudget } = await import("$lib/server/trial-quota");

		expect(getTrialTokenBudget()).toBe(75_000);
	});

	it("rejects invalid TRIAL_TOKEN_BUDGET values", async () => {
		mockEnv.TRIAL_TOKEN_BUDGET = "0";
		const { getTrialTokenBudget } = await import("$lib/server/trial-quota");

		expect(() => getTrialTokenBudget()).toThrow("TRIAL_TOKEN_BUDGET must be a positive integer");
	});
});

describe("getTrialQuotaBalance", () => {
	it("keeps an existing persisted quota even when env changes", async () => {
		mockEnv.TRIAL_TOKEN_BUDGET = "75000";
		mockUserQuotaFindFirst.mockResolvedValueOnce({ trialTokensLeft: 123, trialTokensTotal: 50_000 });
		const { getTrialQuotaBalance } = await import("$lib/server/trial-quota");

		await expect(getTrialQuotaBalance("user-1")).resolves.toEqual({ trialTokensLeft: 123, trialTokensTotal: 50_000 });
		expect(mockDbInsert).not.toHaveBeenCalled();
	});

	it("initializes new quota rows from TRIAL_TOKEN_BUDGET", async () => {
		mockEnv.TRIAL_TOKEN_BUDGET = "75000";
		mockUserQuotaFindFirst.mockResolvedValueOnce(undefined);
		mockInsertReturning.mockResolvedValueOnce([{ trialTokensLeft: 75_000, trialTokensTotal: 75_000 }]);
		const { getTrialQuotaBalance } = await import("$lib/server/trial-quota");

		await expect(getTrialQuotaBalance("user-1")).resolves.toEqual({ trialTokensLeft: 75_000, trialTokensTotal: 75_000 });
		expect(mockInsertValues).toHaveBeenCalledWith({ userId: "user-1", trialTokensLeft: 75_000, trialTokensTotal: 75_000 });
	});
});
