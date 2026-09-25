import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ observe: vi.fn(), getRecord: vi.fn() }));
vi.mock("$lib/server/streak", () => ({ recordReviewObservation: mocks.observe, getStreakRecord: mocks.getRecord }));

import { POST } from "../../../../src/routes/api/streak/observe/+server";

const now = new Date("2026-09-22T12:00:00Z");
const post = (authenticated = true) =>
	POST({
		locals: { user: authenticated ? { id: "learner" } : null },
		cookies: { get: () => "America/Los_Angeles" },
	} as unknown as Parameters<typeof POST>[0]);

describe("visible-page review observation", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(now);
	});
	afterEach(() => vi.useRealTimers());
	it("requires an authenticated session", async () => {
		expect((await post(false)).status).toBe(401);
		expect(mocks.observe).not.toHaveBeenCalled();
	});
	it("rechecks the account queue using server time and validated browser timezone", async () => {
		mocks.observe.mockResolvedValue({ reviewCleared: true });
		const response = await post();
		expect(mocks.observe).toHaveBeenCalledExactlyOnceWith("learner", now, "America/Los_Angeles");
		expect(await response.json()).toEqual({ streak: { reviewCleared: true } });
		expect(mocks.getRecord).not.toHaveBeenCalled();
	});
	it("returns the authoritative record even when another tab already observed it", async () => {
		mocks.observe.mockResolvedValue(null);
		mocks.getRecord.mockResolvedValue({ reviewCleared: true });
		expect(await (await post()).json()).toEqual({ streak: { reviewCleared: true } });
		expect(mocks.getRecord).toHaveBeenCalledExactlyOnceWith("learner");
	});
	it("does not turn a failed observation into a success", async () => {
		mocks.observe.mockRejectedValue(new Error("database unavailable"));
		expect((await post()).status).toBe(503);
	});
});
