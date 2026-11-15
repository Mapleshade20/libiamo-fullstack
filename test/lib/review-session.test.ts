import assert from "node:assert/strict";
import { test } from "vitest";
import type { Outcome } from "#lib/notebook/types.ts";
import { createSitting } from "#lib/review/session.ts";

const stay = (m: number): Outcome => ({ label: `${m}m`, stays: true, inMs: m * 60_000 });
const leave = (d: number): Outcome => ({ label: `${d}d`, stays: false, inMs: d * 864e5 });
const fresh = { again: stay(1), hard: stay(6), good: stay(10), easy: leave(4) };
const known = { again: stay(10), hard: leave(2), good: leave(5), easy: leave(9) };

test("a card the rating keeps comes back in the same sitting, after the main queue", () => {
	const t = 0;
	const s = createSitting(
		[
			{ id: "a", queue: "new" as const, outcomes: fresh },
			{ id: "b", queue: "review" as const, outcomes: known },
		],
		() => t,
	);
	assert.equal(s.current?.card.id, "a");
	s.rate("again");
	assert.deepEqual(s.counts(), { new: 0, learning: 1, review: 1 });
	assert.equal(s.current?.card.id, "b");
	s.rate("good");
	// Nothing else left: the learning card is shown early.
	assert.equal(s.current?.card.id, "a");
	assert.equal(s.current?.queue, "learning");
	s.rate("easy");
	assert.equal(s.current, undefined);
	assert.deepEqual(s.done.find((i) => i.card.id === "a")?.ratings, ["again", "easy"]);
});

test("a due learning card goes before the main queue", () => {
	let t = 0;
	const s = createSitting(
		["a", "b", "c"].map((id) => ({ id, queue: "new" as const, outcomes: fresh })),
		() => t,
	);
	s.rate("again");
	assert.equal(s.current?.card.id, "b");
	t = 61_000;
	s.rate("good");
	assert.equal(s.current?.card.id, "a");
});

test("the server's answer to a rating says what the card's next ratings do", () => {
	const s = createSitting([{ id: "a", queue: "new" as const, outcomes: fresh }], () => 0);
	const it = s.rate("good");
	assert.ok(it);
	s.settle(it, { queue: "learning", outcomes: { ...fresh, good: leave(1) } });
	assert.deepEqual(s.intervals(it), ["1m", "6m", "1d", "4d"]);
});

test("a learning card cannot be rated again with unconfirmed outcomes, or finish before confirmation", () => {
	const s = createSitting([{ id: "a", queue: "new" as const, outcomes: fresh }], () => 0);
	const it = s.rate("good", true);
	assert.ok(it);
	assert.equal(s.current, undefined);
	assert.equal(s.waiting, 1);
	assert.equal(s.rate("good", true), undefined);
	s.settle(it, { queue: "learning", outcomes: { ...fresh, good: leave(1) } });
	s.rate("good", true);
	assert.equal(s.waiting, 1);
	s.settle(it, { queue: "review", outcomes: known });
	assert.equal(s.waiting, 0);
	assert.equal(s.current, undefined);
	assert.equal(s.done.length, 1);
});

test("the server's queue corrects an optimistic prediction", () => {
	const s = createSitting([{ id: "a", queue: "new" as const, outcomes: fresh }], () => 0);
	const it = s.rate("good", true);
	assert.ok(it);
	s.settle(it, { queue: "review", outcomes: known });
	assert.deepEqual(s.counts(), { new: 0, learning: 0, review: 0 });
	assert.equal(s.done.length, 1);
});
