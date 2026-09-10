import { afterEach, expect, it, vi } from "vitest";
import { BROWSER_TIMEZONE_COOKIE } from "$lib/browser-timezone";
import { load } from "$routes/+layout.server";

afterEach(() => vi.useRealTimers());

it("serializes one request clock using the validated browser timezone", async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-09-04T00:30:00Z"));
	const cookies = { get: (name: string) => (name === BROWSER_TIMEZONE_COOKIE ? "America/Los_Angeles" : undefined) };
	expect(await load({ cookies } as any)).toEqual({ displayClock: { now: Date.now(), timeZone: "America/Los_Angeles" } });
	expect(await load({ cookies: { get: () => "invalid-zone" } } as any)).toEqual({ displayClock: { now: Date.now(), timeZone: "UTC" } });
});
