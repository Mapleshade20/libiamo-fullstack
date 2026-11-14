import assert from "node:assert/strict";
import { test } from "vitest";
import { isCurrent, rank, shelfOf } from "#lib/server/scenario/rank.ts";

const c = (id: string, place: string, publishedAt: number, state: "new" | "open" | "written" = "new") => ({ id, place, publishedAt, state }) as never;
const ids = (list: { id: string }[]) => list.map((x) => x.id);

test("for you: unwritten first, places taking turns, newer first", () => {
	const list = [c("a1", "ao3", 5), c("a2", "ao3", 4), c("r1", "reddit", 3), c("e1", "email", 1, "written"), c("r2", "reddit", 2)];
	assert.deepEqual(ids(rank(list)), ["a1", "r1", "a2", "r2", "e1"]);
});

test("the shelf takes the issue's first unwritten, then pool scenarios not yet started", () => {
	const issue = [c("i1", "ao3", 9, "written"), c("i2", "email", 8)];
	const pool = [c("p1", "reddit", 7, "open"), c("p2", "discord", 6), c("p3", "ao3", 5)];
	assert.deepEqual(ids(shelfOf(issue, pool)), ["i2", "p2"]);
	assert.deepEqual(ids(shelfOf([], pool)), ["p2", "p3"]);
});

test("an issue is current for thirty days from its date, not before", () => {
	const now = new Date("2026-11-14T12:00:00Z");
	assert.equal(isCurrent("2026-10-28", now), true);
	assert.equal(isCurrent("2026-09-01", now), false);
	assert.equal(isCurrent("2026-11-20", now), false);
});
