import { expect, it } from "vitest";
import { greetingAt } from "#lib/components/home/greeting.ts";

it("draws the same for the server and the hydrating browser, and afresh a minute later", () => {
	const now = Date.UTC(2026, 10, 24, 8, 30);
	expect(greetingAt(now + 59_000, "UTC")).toEqual(greetingAt(now, "UTC"));
	const drawn = new Set(Array.from({ length: 30 }, (_, i) => greetingAt(now + i * 60_000, "UTC").greeting));
	expect(drawn.size).toBeGreaterThan(3);
});

it("greets for the learner's moment, in their time zone", () => {
	// 08:00 UTC is 17:00 in Tokyo on a Tuesday: an evening there, never a morning.
	for (let i = 0; i < 60; i++) expect(greetingAt(Date.UTC(2026, 10, 24, 8, i), "Asia/Tokyo").greeting).toMatch(/^greet(Evening|Any)/);
});
