// pipeline/base.ts without model calls: the key is cleared before llm.ts loads, so any call fails.
import assert from "node:assert/strict";
import { test } from "vitest";

process.env.OPENROUTER_API_KEY = "";
process.env.OPENAI_API_KEY = "";
const { analysisBase, rebase } = await import("$model/pipeline/base.ts");
const { withLivePieces } = await import("$model/session/live.ts");

const draft = (text: string) => ({
	id: "t",
	text,
	target: "en" as const,
	learner: "zh-CN" as const,
	feedback: "zh-CN" as const,
	level: "",
	scene: { platform: "Reddit", audience: "fans", purpose: "a theory" },
});

test("spots away from every pass-1 change move onto the pass-1 text without a call, sentence numbers and all", async () => {
	const d = draft("The sky was overcast so the moonlight cannot reach. I have read every one of the books twice now. Clouds alone explain it?");
	const base = analysisBase(
		d,
		"The sky was overcast, so the moonlight couldn't reach. I have read every one of the books twice now. Clouds alone explain it?",
	);
	assert.deepEqual(base.left, []);
	const r = await rebase(
		d,
		base,
		{
			gist: "",
			map: [{ role: "x", what: "y", sentences: [3], status: "fix" }],
			spots: [{ quote: "Clouds alone explain it?", problem: "p", sentences: [3], mode: "one", readings: [] }],
		},
		"haiku",
	);
	assert.equal(r.calls.length, 0);
	assert.equal(r.analysis.spots[0].quote, "Clouds alone explain it?");
	assert.deepEqual(r.analysis.map[0].sentences, [3]);
});

test("spans pass 1 left for the writer are what pass 2 must cover", () => {
	const d = draft("Osmanthus latte: home made osmanthus sauce, with milk cap.");
	assert.deepEqual(analysisBase(d, "Osmanthus latte: ⟦home made osmanthus sauce⟧, with milk foam.").left, ["home made osmanthus sauce"]);
});

test("hint pieces the vetted reference no longer uses go, and a fork keeps the side that stayed", () => {
	const m = {
		ref: "I think it is not StarClan's fault. They're [still] there, they just can't reach the cats.",
		alts: [],
		pieces: ["cut off", "still", "gather / reach"],
	};
	assert.deepEqual(withLivePieces(m).pieces, ["still", "reach"]);
});
