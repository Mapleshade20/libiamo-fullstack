import assert from "node:assert/strict";
import { test } from "vitest";
import { inPostOrder, type Outline, oncePerSentence } from "#lib/server/revision/pass2/map.ts";

const part = (sentences: number[], extra = {}) => ({ kind: "detail", text: "", sentences, ...extra });

test("a sentence under a part leaves its point; a heading over one part becomes that part", () => {
	const o: Outline = {
		points: [
			{ text: "a", sentences: [1, 2], parts: [part([2])] },
			{ text: "b", sentences: [], parts: [part([3])] },
		],
	};
	const out = oncePerSentence(o).points;
	assert.deepEqual(out[0].sentences, [1]);
	assert.deepEqual([out[1].sentences, out[1].parts.length], [[3], 0]);
});

test("points and parts follow the post; a missing part stays after the part before it", () => {
	const o: Outline = {
		points: [
			{ text: "late", sentences: [5], parts: [] },
			{ text: "early", sentences: [], parts: [part([3]), part([], { missing: true, text: "gap" }), part([2])] },
		],
	};
	const out = inPostOrder(o).points;
	assert.deepEqual(
		out.map((p) => p.text),
		["early", "late"],
	);
	assert.deepEqual(
		out[0].parts.map((x) => x.text || x.sentences.join()),
		["2", "3", "gap"],
	);
});
