import assert from "node:assert/strict";
import { test } from "vitest";
import { hintOf, verdictOf } from "$lib/review/check.ts";

const own = { kind: "own" as const, answer: "it left him miserable and furious", also: ["it left him furious and miserable"] };
const read = { kind: "collected" as const, answer: "For what it's worth" };

test("a typed answer matches regardless of case, punctuation and curly quotes", () => {
	assert.equal(verdictOf(read, "for what it’s worth!"), "exact");
	assert.equal(verdictOf(own, "It left him furious and miserable."), "exact");
});

test("a small slip is close, not wrong", () => {
	assert.equal(verdictOf(read, "for what its worht"), "close");
});

test("another answer is the learner's to judge on their own sentence, a miss on a collected phrase", () => {
	assert.equal(verdictOf(own, "he became really sad and angry"), "other");
	assert.equal(verdictOf(read, "in my opinion"), "miss");
	assert.equal(verdictOf(read, "   "), "none");
});

test("the hint keeps each word's first letter and length", () => {
	assert.equal(hintOf("For what it's worth"), "F·· w··· i·'· w····");
});

test("reuse finds worked-out phrases in a new text, whatever the case or quotes", async () => {
	const { reused, markReused } = await import("$lib/review/reuse.ts");
	assert.deepEqual(reused("Would it be possible to have ONE more week?", ["would it be possible to have", "I've been visiting her"]), [true, false]);
	assert.deepEqual(
		markReused("So it left him miserable.", ["it left him miserable"]).map((r) => r.hit),
		[false, true, false],
	);
});
