import assert from "node:assert/strict";
import { test } from "vitest";
import { learnedFrom, NoteAsk } from "#lib/server/writing/learned.ts";

const note = (phrase: string) => ({ phrase, meaning: "", usage: "", examples: [] });

test("the entries keep the page's order (theirs, then given, then pass 1's), skip what earned none, and stop at six", () => {
	const ask = NoteAsk.parse({
		items: [
			{ id: "s1", orig: "a", final: "A", own: true },
			{ id: "s2", orig: "b", final: "B" },
		],
		p1: ["p1", "p2", "p3", "p4", "p5", "p6"],
	});
	const notes = {
		s1: { note: note("one"), orig: "a", final: "A" },
		s2: { note: null, orig: "b", final: "B" },
		...Object.fromEntries(["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => [id, { note: note(id), orig: "x", final: "y", was: id }])),
	};
	const out = learnedFrom(ask, notes);
	assert.deepEqual(
		out.map((l) => [l.text, l.own]),
		[
			["one", true],
			["p1", false],
			["p2", false],
			["p3", false],
			["p4", false],
			["p5", false],
		],
	);
	assert.equal(out[1].was, "p1");
	assert.equal(out[0].was, undefined);
});
