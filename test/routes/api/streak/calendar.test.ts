import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCalendar: vi.fn() }));
vi.mock("$lib/server/streak", () => ({ getStreakCalendar: mocks.getCalendar, devStreakDayOffset: () => 0 }));

import { GET } from "../../../../src/routes/api/streak/calendar/+server";

function get(month: string, authenticated = true) {
	return GET({
		locals: { user: authenticated ? { id: "learner", createdAt: new Date("2026-08-15T03:00:00Z") } : null },
		cookies: { get: () => "America/Los_Angeles" },
		url: new URL(`http://localhost/api/streak/calendar?month=${month}`),
	} as unknown as Parameters<typeof GET>[0]);
}
describe("private bounded calendar endpoint", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-01T02:00:00Z"));
	});
	afterEach(() => vi.useRealTimers());
	it("requires authentication, validates bounds before querying", async () => {
		expect((await get("2026-09", false)).status).toBe(401);
		expect((await get("2026-13")).status).toBe(400);
		expect(mocks.getCalendar).not.toHaveBeenCalled();
	});
	it("scopes to the session user, uses local days for today and sign-up, and forbids shared caching", async () => {
		mocks.getCalendar.mockResolvedValue({ days: [{ day: "2026-09-30", state: "lit" }], since: "2026-09-01" });
		const response = await get("2026-09");
		expect(mocks.getCalendar).toHaveBeenCalledExactlyOnceWith("learner", "2026-09", "2026-09-30", "2026-08-14");
		expect(response.headers.get("Cache-Control")).toBe("private, no-store");
		expect((await response.json()).days).toHaveLength(1);
	});
});
