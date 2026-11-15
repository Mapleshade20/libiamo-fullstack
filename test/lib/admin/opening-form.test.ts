import assert from "node:assert/strict";
import { test } from "vitest";
import { dropAt, flattenComments, nestComments, replyAt } from "#lib/admin/opening-form.ts";

test("a comment tree survives the editor's flat list: flattened, edited, nested again", () => {
	const tree = [
		{ author: "a", text: "1", replies: [{ author: "b", text: "1.1", timestamp: "2 hr. ago", replies: [{ author: "c", text: "1.1.1" }] }] },
		{ author: "d", text: "2" },
	];
	const flat = flattenComments("reddit", tree);
	assert.deepEqual(
		flat.map((c) => [c.author, c.depth]),
		[
			["a", 0],
			["b", 1],
			["c", 2],
			["d", 0],
		],
	);
	assert.deepEqual(nestComments("reddit", flat), tree);
	replyAt(flat, 0);
	assert.deepEqual(
		flat.map((c) => c.depth),
		[0, 1, 2, 1, 0],
	);
	dropAt(flat, 1);
	assert.deepEqual(
		flat.map((c) => c.author),
		["a", "", "d"],
	);
	const ao3 = nestComments("ao3", [{ author: "x", text: "hi", depth: 0 }]);
	assert.deepEqual(ao3, [{ username: "x", comment: "hi" }]);
});
