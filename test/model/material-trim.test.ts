import assert from "node:assert/strict";
import { test } from "vitest";
import { trimSame } from "$model/pass2/material.ts";

test("a reference that starts inside the previous sentence loses that fragment, in the span, the reference and the alternatives", () => {
	const text = "When the Clans are at the Moonstone the moonlight cannot reach the stone. Maybe the clouds alone explain it?";
	const from = text.indexOf("Maybe");
	const m = trimSame(
		{
			replaces: "stone. Maybe the clouds alone explain it?",
			ref: "stone. Maybe the clouds alone explain [why] StarClan can't reach them?",
			alts: ["stone. Maybe that's why.", "Clouds, maybe?"],
		},
		text,
		from,
		text.length,
	);
	assert.equal(m.replaces, "Maybe the clouds alone explain it?");
	assert.equal(m.ref, "Maybe the clouds alone explain [why] StarClan can't reach them?");
	assert.deepEqual(m.alts, ["Maybe that's why.", "Clouds, maybe?"]);
});

test("a whole line for a spot on its name shrinks to the name, never cutting into the spot", () => {
	const text = "Hot red wine (non-alcoholic): cinnamon, orange peel and cloves, suitable for rainy days.";
	const m = trimSame(
		{
			replaces: text,
			ref: "[Mulled] wine (non-alcoholic): cinnamon, orange peel and cloves, suitable for rainy days.",
			alts: ["Mulled wine (non-alcoholic): cinnamon, orange peel and cloves, suitable for rainy days."],
		},
		text,
		0,
		"Hot red wine".length,
	);
	assert.equal(m.replaces, "Hot red wine");
	assert.equal(m.ref, "[Mulled] wine");
	assert.deepEqual(m.alts, ["Mulled wine"]);
});

test("a span that differs at both ends stays as it is", () => {
	const text = "Osmanthus latte: syrup, with a little sea salt milk cap.";
	const own = { replaces: "with a little sea salt milk cap.", ref: "[topped] with a sea-salt [foam].", alts: [] };
	assert.deepEqual(trimSame(own, text, text.indexOf("with"), text.length), own);
});

test("a common end inside a clause is not cut, so the reference never ends on a fragment", () => {
	const text = "Hot red wine (non-alcoholic): cinnamon, orange peel and cloves, suitable for rainy days.";
	const m = { replaces: text, ref: "[Mulled] wine (non-alcoholic): cinnamon, orange peel and cloves, good for rainy days.", alts: [] };
	assert.deepEqual(trimSame(m, text, 0, "Hot red wine".length), m);
});
