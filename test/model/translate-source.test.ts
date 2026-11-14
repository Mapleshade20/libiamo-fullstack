import assert from "node:assert/strict";
import { test } from "vitest";
import { fixNames, keepNames } from "$model/translate/source.ts";

test("names go back to the original's spelling in the source and the glosses; terms keep their rendering", () => {
	const r = keepNames(
		{
			source: ["鸦羽和玳瑁毛当情侣，离谱。", "鸦羽一直和Leafpool纠缠，CP太怪。"],
			glossary: [
				{ term: "Crowfeather", shown: "鸦羽", gloss: "一只猫" },
				{ term: "Tawnypelt", shown: "玳瑁毛", gloss: "效忠ShadowClan" },
				{ term: "Leafpool", shown: "Leafpool", gloss: "鸦羽过去的恋人" },
				{ term: "pairing", shown: "CP", gloss: "配对" },
			],
		},
		[
			{ term: "Crowfeather", kind: "name", note: "" },
			{ term: "Tawnypelt", kind: "name", note: "" },
			{ term: "Leafpool", kind: "name", note: "" },
			{ term: "pairing", kind: "term", note: "" },
		],
	);
	assert.deepEqual(r.source, ["Crowfeather和Tawnypelt当情侣，离谱。", "Crowfeather一直和Leafpool纠缠，CP太怪。"]);
	assert.deepEqual(
		r.glossary.map((g) => g.shown),
		["Crowfeather", "Tawnypelt", "Leafpool", "CP"],
	);
	assert.equal(r.glossary[2].gloss, "Crowfeather过去的恋人");
});

test("the work's name table wins: settled renderings replace both the English and the model's guess; others stay original", () => {
	const r = fixNames(
		{
			source: ["Crowfeather和玳瑁毛当情侣，离谱。Feathertail和Leafpool。"],
			glossary: [
				{ term: "Crowfeather", shown: "Crowfeather", gloss: "一只猫" },
				{ term: "Tawnypelt", shown: "玳瑁毛", gloss: "效忠ShadowClan" },
				{ term: "Feathertail", shown: "Feathertail", gloss: "Crowfeather过去的恋人" },
				{ term: "Leafpool", shown: "Leafpool", gloss: "" },
				{ term: "ShadowClan", shown: "ShadowClan", gloss: "" },
			],
		},
		[
			{ term: "Crowfeather", kind: "name", note: "" },
			{ term: "Tawnypelt", kind: "name", note: "" },
			{ term: "Feathertail", kind: "name", note: "" },
			{ term: "Leafpool", kind: "name", note: "" },
			{ term: "ShadowClan", kind: "name", note: "" },
		],
		new Map([
			["Crowfeather", "鸦羽"],
			["Tawnypelt", "褐皮"],
			["Feathertail", "羽尾"],
			["ShadowClan", "影族"],
			["Leafpool", null],
		]),
	);
	assert.deepEqual(r.source, ["鸦羽和褐皮当情侣，离谱。羽尾和Leafpool。"]);
	assert.deepEqual(
		r.glossary.map((g) => g.shown),
		["鸦羽", "褐皮", "羽尾", "Leafpool", "影族"],
	);
	assert.equal(r.glossary[1].gloss, "效忠影族");
	assert.equal(r.glossary[2].gloss, "鸦羽过去的恋人");
});
