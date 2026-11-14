import assert from "node:assert/strict";
import { test } from "vitest";
import { foldCopies } from "$lib/demo/fold.ts";

const piece = (id: string, at: number, extra: object = {}) => ({ id, at, lang: "en", handoff: { text: "Brokenstar…" }, ...extra });
test("copies of one piece fold into one, a finished copy first, then the newest", () => {
	assert.deepEqual(
		foldCopies([piece("a", 1), piece("b", 3), piece("c", 2)], new Set()).map((w) => w.id),
		["b"],
	);
	assert.deepEqual(
		foldCopies([piece("a", 1, { result: {} }), piece("b", 3)], new Set()).map((w) => w.id),
		["a"],
	);
	// Another language, another scenario, or a stand-in's own record is another piece.
	assert.equal(
		foldCopies([piece("a", 1), piece("b", 2, { lang: "es" }), piece("c", 3, { scenarioId: "q" }), { id: "w1", at: 0 }], new Set(["w1"])).length,
		4,
	);
});
