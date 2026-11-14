import assert from "node:assert/strict";
import { test } from "vitest";
import { addDays, localDay, startOfLocalDay, weekStartOf } from "#lib/time/local-day.ts";

test("a local day is the zone's, whatever the instant's UTC date", () => {
	const at = new Date("2026-11-14T20:00:00Z");
	assert.equal(localDay(at, "Asia/Shanghai"), "2026-11-15");
	assert.equal(localDay(at, "America/Los_Angeles"), "2026-11-14");
	assert.equal(startOfLocalDay("2026-11-15", "Asia/Shanghai").toISOString(), "2026-11-14T16:00:00.000Z");
});

test("weeks start on Monday", () => {
	assert.equal(weekStartOf("2026-11-14"), "2026-11-09");
	assert.equal(weekStartOf("2026-11-09"), "2026-11-09");
	assert.equal(weekStartOf("2026-11-15"), "2026-11-09");
	assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
