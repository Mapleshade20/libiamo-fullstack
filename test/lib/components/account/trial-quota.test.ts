import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRIAL_QUOTA_DEPENDENCY } from "$lib/app/load-dependencies";

const mocks = vi.hoisted(() => ({ invalidate: vi.fn(async () => {}), page: { data: {} as Record<string, unknown> } }));
vi.mock("$app/navigation", () => ({ invalidate: mocks.invalidate }));
vi.mock("$app/state", () => ({ page: mocks.page }));

import { refreshTrialQuota } from "$lib/components/account/trial-quota";

describe("refreshTrialQuota", () => {
	beforeEach(() => vi.clearAllMocks());

	it("re-reads the trial balance a learner is spending", async () => {
		mocks.page.data = { trialQuota: { trialTokensLeft: 10, trialTokensTotal: 100 } };
		await refreshTrialQuota();
		expect(mocks.invalidate).toHaveBeenCalledExactlyOnceWith(TRIAL_QUOTA_DEPENDENCY);
	});

	it("reloads nothing for a learner on their own API key", async () => {
		mocks.page.data = { trialQuota: null };
		await refreshTrialQuota();
		expect(mocks.invalidate).not.toHaveBeenCalled();
	});
});
