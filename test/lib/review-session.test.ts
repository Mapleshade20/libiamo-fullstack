import assert from "node:assert/strict";
import { test } from "vitest";
import { createSitting, intervals } from "$lib/review/session.ts";

test("a card rated within minutes comes back in the same sitting, after the main queue", () => {
	const t = 0;
	const s = createSitting(
		[
			{ card: "a", state: "new" },
			{ card: "b", state: "review" },
		],
		() => t,
	);
	assert.equal(s.current?.card, "a");
	s.rate("again");
	assert.deepEqual(s.counts(), { new: 0, learning: 1, review: 1 });
	assert.equal(s.current?.card, "b");
	s.rate("good");
	// Nothing else left: the learning card is shown early.
	assert.equal(s.current?.card, "a");
	s.rate("good");
	assert.equal(s.current?.state, "learning");
	assert.equal(s.current?.step, 1);
	s.rate("good");
	assert.equal(s.current, undefined);
	assert.deepEqual(s.done.find((i) => i.card === "a")?.ratings, ["again", "good", "good"]);
});

test("a due learning card goes before the main queue", () => {
	let t = 0;
	const s = createSitting(
		[
			{ card: "a", state: "new" },
			{ card: "b", state: "new" },
			{ card: "c", state: "new" },
		],
		() => t,
	);
	s.rate("again");
	assert.equal(s.current?.card, "b");
	t = 61_000;
	s.rate("good");
	assert.equal(s.current?.card, "a");
});

test("intervals depend on where the card is", () => {
	assert.deepEqual(intervals({ state: "new", step: 0 }), ["1m", "6m", "10m", "4d"]);
	assert.deepEqual(intervals({ state: "review", step: 0 }), ["10m", "2d", "5d", "9d"]);
});
