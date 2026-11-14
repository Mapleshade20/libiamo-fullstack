import assert from "node:assert/strict";
import { test } from "vitest";
import { markKeys } from "$model/pass2/keys.ts";

const row = (label: string, note = "") => ({ label, note });
test("marks what each explained choice changed, not the words the writer already had", () => {
	const mine = `“This is more than I deserve from you,” Apart from coming to terms with his fate out of, what you said, "captain's integrity", he's also somehow accepting her as his mother and feeling gratitude for her final care, and was there even a bit regret of what he had done to her?`;
	const ref = `When Brokenstar says “This is more than I deserve from you,” is he accepting his fate out of "captain's integrity" — what you said? Or is he also [somehow] accepting her as his mother, and feeling gratitude for her final care? And was there even a little [regret] for what he did to her?`;
	const r = markKeys(mine, ref, [
		row("When Brokenstar says “…,”"),
		row("Or is he also"),
		row("somehow", "保留你原句里的 somehow"),
		row("even a little regret", "regret 作名词加 for，表示对所做之事的后悔。"),
	]);
	assert.deepEqual(
		[...r.ref.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]),
		["When Brokenstar says", "Or is he", "little", "for"],
	);
	// Keeping their own word is a remark, not a change to learn.
	assert.deepEqual(
		r.why.map((w) => !!w.free),
		[false, false, true, false],
	);
	assert.equal(r.ref.replace(/[[\]]/g, ""), ref.replace(/[[\]]/g, ""));
});

test("a row about a long rewrite keeps only the model's marks inside it", () => {
	const r = markKeys("I remember he resented it.", "I [still] remember. That resentment is [exactly] why his trust kept wobbling.", [
		row("I still remember"),
		row("That resentment is exactly why his trust kept wobbling"),
	]);
	assert.equal(r.ref, "I [still] remember. That resentment is [exactly] why his trust kept wobbling.");
});

test("rows that cannot be found leave the model's marks", () => {
	assert.equal(markKeys("a b", "x [y] z", [row("nothing like it")]).ref, "x [y] z");
});
