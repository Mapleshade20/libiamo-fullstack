import { z } from "zod";
import { type Draft, LANG_NAMES } from "../fixtures/types.ts";
import { type CallResult, chatJson, type ModelKey } from "../llm.ts";
import type { Analysis, Sentence } from "./analyze.ts";

/**
 * C4c: a second look at formulation spots from the community's side. "List every one" (user, 2026-10-23) lets bad
 * advice through, e.g. making an AO3 comment praise the text instead of the author's writing; this drops those.
 */
export async function vetFormulation(
	d: Draft,
	ss: Sentence[],
	a: Analysis,
	fresh: string,
	model: ModelKey,
	sample: number,
): Promise<{ analysis: Analysis; dropped: { problem: string; why: string }[]; call?: CallResult }> {
	const ids = a.spots.map((s, i) => ({ s, i })).filter(({ s }) => s.kind === "formulation");
	if (!ids.length) return { analysis: a, dropped: [] };
	const T = LANG_NAMES[d.target];
	const list = ids
		.map(
			({ s, i }) =>
				`#${i + 1} ${ss
					.filter((x) => s.sentences.includes(x.id))
					.map((x) => x.text)
					.join(" ")}${s.phrase ? `\n   (the words: "${s.phrase}")` : ""}\n   tutor's note: ${s.problem}`,
		)
		.join("\n");
	const user = `You are a fluent, native ${T}-speaking regular of ${d.scene.platform}. Readers: ${d.scene.audience}. A learner wrote this:\n<<<\n${d.text}\n>>>\n\nA fluent version written from the same points:\n<<<\n${fresh}\n>>>\n\nA tutor wants the learner to rework how these sentences are put:\n${list}\n\nFor each, decide from your seat as a member of this community: keep it if reworking it as the tutor says would make the post read better to you or do its job better (the praise lands, the question gets answered, the point gets across). Drop it if the learner's wording is already what a fluent regular would write here, if the tutor's direction would weaken what the writer is doing, or if it is only a matter of taste.\nReply with JSON only: {"verdicts":[{"id":1,"keep":true,"why":"one short English sentence"}]}`;
	const r = await chatJson(
		[{ role: "user", content: user }],
		z.object({ verdicts: z.array(z.object({ id: z.number(), keep: z.boolean(), why: z.string() })) }),
		{ model, sample, effort: "low", tag: "e6/vet" },
	);
	const drop = new Set(r.value.verdicts.filter((v) => !v.keep).map((v) => v.id - 1));
	return {
		analysis: { ...a, spots: a.spots.filter((_, i) => !drop.has(i)) },
		dropped: r.value.verdicts.filter((v) => !v.keep).map((v) => ({ problem: a.spots[v.id - 1]?.problem ?? "?", why: v.why })),
		call: r.calls[0],
	};
}
