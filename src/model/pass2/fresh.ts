import { type Caller, type CallResult, chat } from "#lib/server/llm/caller.ts";
import { type Draft, LANG_NAMES, noteLines } from "../fixtures/types.ts";

/**
 * A fluent version written from the writer's points rather than edited from their sentences, so it does not inherit the
 * draft's packaging. Pass 2 compares the draft against it to find formulation spots.
 */
export async function freshNative(d: Draft, ai: Caller, sample: number): Promise<{ points: string; fresh: string; call: CallResult }> {
	const T = LANG_NAMES[d.target];
	const system = `You are a fluent, native ${T}-speaking member of this community: ${d.scene.platform}.`;
	const user = [
		`Readers: ${d.scene.audience}. What the writer wants to do: ${d.scene.purpose}.`,
		...noteLines(d),
		d.title ? `Title: ${d.title}` : "",
		"",
		"A learner's draft:",
		"<<<",
		d.text,
		">>>",
		"",
		`Work in two steps.`,
		"",
		`Step 1. Under "### POINTS", list every point the draft makes, in order, as short plain ${T} notes: what is meant, never how it is said. Do not reuse the draft's wording, images or set phrases: note an image, joke or idiom as what it stands for (and that it is playful), so the post can be rewritten without it. Include feelings, jokes and questions. Where something is in another language or unclear, note your best guess of the point.`,
		"",
		`Step 2. Under "### FRESH", close the draft and write the post from your notes alone, as you would write it yourself for these readers: your own sentence shapes, emphasis, idioms and rhythm. Keep every point, the writer's register and tone markers (emoji, "lol", "~"), a similar length, and their order unless another order clearly serves the reader better.`,
		"",
		"Reply with the two sections only.",
	]
		.filter((l) => l !== "")
		.join("\n");
	const call = await chat(
		[
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		{ ai, sample, tag: "e6/fresh" },
	);
	const points = call.text.match(/###\s*POINTS\s*\n([\s\S]*?)(?=\n###\s*FRESH)/)?.[1]?.trim() ?? "";
	const fresh = call.text.split(/###\s*FRESH\s*\n/)[1]?.trim() ?? "";
	if (!fresh) throw new Error("fresh native missing");
	return { points, fresh, call };
}
