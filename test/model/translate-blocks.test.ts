import assert from "node:assert/strict";
import { test } from "vitest";
import { blockAt, blocksOf, termRuns } from "$model/translate/blocks.ts";

const slices = (t: string, byLine: boolean) => blocksOf(t, byLine).map((b) => t.slice(b.from, b.to));

test("prose pairs by blank-line paragraphs, a list by lines; empty lines never count", () => {
	assert.deepEqual(slices("One.\nStill one.\n\n\n  Two. \n\n", false), ["One.\nStill one.", "Two."]);
	assert.deepEqual(slices("a\n\nb\nc\n", true), ["a", "b", "c"]);
});

test("the caret writes the block it is in, or the one a fresh line starts", () => {
	const t = "First para.\n\nSecond";
	assert.equal(blockAt(t, 0, false), 0);
	assert.equal(blockAt(t, 11, false), 0); // end of the first
	assert.equal(blockAt(t, 12, false), 1); // the empty line after it starts the second
	assert.equal(blockAt(t, t.length, false), 1);
	assert.equal(blockAt("First para.\n\n", 13, false), 1);
	assert.equal(blockAt("", 0, false), 0);
	assert.equal(blockAt("a\nb", 3, true), 1);
	assert.equal(blockAt("a\nb\n", 4, true), 2);
});

test("given terms are marked as the source shows them, whole words for Latin, longest first", () => {
	const terms = [
		{ term: "Leafpool", shown: "Leafpool", gloss: "" },
		{ term: "Leaf", shown: "Leaf", gloss: "" },
		{ term: "osmanthus", shown: "桂花", gloss: "" },
	];
	const runs = termRuns("Leafpool和桂花拿铁", terms);
	assert.deepEqual(
		runs.map((r) => (r.term ? [r.text, r.term.term] : [r.text])),
		[["Leafpool", "Leafpool"], ["和"], ["桂花", "osmanthus"], ["拿铁"]],
	);
	assert.deepEqual(
		termRuns("Leafy", terms).map((r) => r.text),
		["Leafy"],
	);
});
