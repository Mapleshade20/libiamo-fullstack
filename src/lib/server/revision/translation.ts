// A translation scenario through the two passes (Q3): the authentic text is the native version pass 1 fixes against and
// pass 2 compares with; the source is what the writer means, so pass 2 asks nothing about meaning. Names and terms
// from the scenario's glossary are given: never a spot.

import { type Caller, type CallResult, chat, chatJson, extractJson } from "#lib/server/llm/caller.ts";
import { type Draft, LANG_NAMES } from "#lib/server/revision/draft.ts";
import { DRAFT_CONVENTIONS, draftBlock, ROUTING, VOICE } from "#lib/server/revision/pass1/context.ts";
import { label, MARK_RULES, merge, type Rewrite } from "#lib/server/revision/pass1/rewrite.ts";
import { AnalysisSchema, leftLine, numbered, SCAN_RULE, SHAPE_V6, sentences, TASK_V6 } from "#lib/server/revision/pass2/analyze.ts";
import type { Gloss } from "#lib/server/translation/source.ts";
import { align } from "#lib/text/diff.ts";

/** context: what the translation is for (the scenario's brief); where / readers: where it will appear and who reads it. */
export type Translation = { source: string; original: string; glossary: Gloss[]; context: string; where?: string; readers?: string };

const intentOf = (d: Draft, t: Translation) =>
	`The writer is translating. What they mean is exactly what this source says (in ${LANG_NAMES[d.learner]}):\n<<<\n${t.source}\n>>>`;
const given = (t: Translation) =>
	t.glossary.length
		? `Names and terms the scenario gives the writer (spelled as given; never a problem in either pass): ${t.glossary.map((g) => g.term).join(", ")}.`
		: "";
// The answering page tells the writer to leave in their own language what they cannot say yet; those words are what
// pass 2 is for (a stop with hints, retrieval, a note), not something pass 1 quietly translates.
// Names of things rendered word for word (奶盖 → "milk cap", 热红酒 → "hot red wine") are the vocabulary a translation
// teaches; pass 1 swapped them silently and left pass 2 nothing on the café menu.
const leftNative = (d: Draft) =>
	`In a translation, words the writer left in ${LANG_NAMES[d.learner]} are where they did not know how to say it (they were told to leave such words for later). The source shows what they mean, but never translate them in pass 1: wrap each in ⟦⟧, with any words that only make sense with it, so pass 2 teaches it. The same for the name of a thing rendered word for word from the source where ${LANG_NAMES[d.target]} has its own name for it (a dish, a drink, an object, a set phrase: 奶盖 as "milk cap", 热红酒 as "hot red wine"): wrap it for pass 2, so the writer learns the name.`;
const authentic = (t: Translation) =>
	`How a fluent member of this community actually wrote the same thing (the authentic text the source was made from; a different, equally good wording is fine, and its extra or missing details are not the writer's errors):\n<<<\n${t.original}\n>>>`;

export function pass1Translation(d: Draft, t: Translation, ai: Caller, known?: Rewrite) {
	const system = `You are a ${LANG_NAMES[d.target]} writing tutor making the first pass over a learner's translation.\n\n${DRAFT_CONVENTIONS(d)}\n\n${ROUTING}\n\n${VOICE(d)}`;
	const user = `${draftBlock(d)}\n\n${intentOf(d, t)}\n\n${given(t)}\n\n${leftNative(d)}\n\n${authentic(t)}\n\nUnder the heading "### PASS 1", write out the draft after pass 1. Use the authentic text to notice everything in the draft that is not how it would naturally be said, then fix every pass-1 problem in place. A part that says something other than the source is pass 2 (meaning), not a fix. ${MARK_RULES}\n\nReply with the section only.`;
	// The rewrite resolves first: pass 2 reads it (pipeline/base.ts) while its changes are being labelled.
	const rewrite: Promise<{ r1: CallResult | null; pass1: string }> = known
		? Promise.resolve({ r1: null, pass1: known.pass1 })
		: chat(
				[
					{ role: "system", content: system },
					{ role: "user", content: user },
				],
				{ ai, sample: 0, tag: "translate/pass1" },
			).then((r1) => ({ r1, pass1: r1.text.split(/###\s*PASS 1\s*\n/)[1]?.trim() ?? r1.text.trim() }));
	const done = rewrite.then(async ({ r1, pass1 }) => {
		const { hunks, opens } = align(d.text, pass1, d.target);
		const labels = await label(
			{ ...d, background: `${d.background ?? ""}\nA translation. The source: ${t.source}`.trim() },
			hunks,
			opens,
			ai,
			0,
			"translate/label",
		);
		return { findings: merge(hunks, opens, labels.value), calls: [...(r1 ? [r1] : []), ...labels.calls] };
	});
	rewrite.catch(() => {});
	done.catch(() => {});
	return { rewrite, done };
}

/** The analysis over the draft as written (a separate pass fixes small errors; pipeline/base.ts rebases the spots on it), with the source as the meaning. */
export async function analyzeTranslation(d: Draft, t: Translation, ai: Caller, left: string[] = []) {
	const text = d.text;
	const ss = sentences(text, d.target);
	const user = [
		`Target language: ${LANG_NAMES[d.target]}. The writer's own language: ${LANG_NAMES[d.learner]}.`,
		`Where: ${t.where ?? t.context}.${t.readers ? ` Readers: ${t.readers}.` : ""} ${t.where ? `What it is for: ${t.context} ` : ""}${intentOf(d, t)}`,
		`Words left in ${LANG_NAMES[d.learner]} are where the writer did not know how to say it: each is inside a spot. Its problem says only that this part is still in ${LANG_NAMES[d.learner]} and what the source means by it here (never that readers cannot tell which meaning: the source says).`,
		given(t),
		"",
		"The writer's translation as they wrote it (a separate pass fixes its small language errors: grammar, articles, tense, wrong words; ignore those). Sentences are numbered:",
		"",
		numbered(ss),
		...(left.length ? [leftLine(left)] : []),
		"",
		`The authentic text, as the fluent version for comparison (not to be copied wholesale; its extra or missing details are not the writer's errors):\n<<<\n${t.original}\n>>>`,
		"",
		TASK_V6(d),
		"",
		`Since the source fixes the meaning, kind "meaning" here is only where the translation says something other than the source, or leaves part of it out; give one reading with mode "one". Never a spot for a name or term the task gives.`,
		"",
		`Reply with JSON only. ${SCAN_RULE}\n${SHAPE_V6}`,
	].join("\n");
	const r = await chat(
		[
			{ role: "system", content: `You are a ${LANG_NAMES[d.target]} writing tutor.` },
			{ role: "user", content: user },
		],
		{ ai, sample: 0, tag: "translate/pass2" },
	);
	let raw: unknown = null;
	try {
		raw = extractJson(r.text);
	} catch {}
	const parsed = AnalysisSchema.safeParse(raw);
	if (parsed.success) return parsed.data;
	return (
		await chatJson(
			[
				{ role: "user", content: user },
				{ role: "assistant", content: r.text },
				{ role: "user", content: `The JSON did not validate:\n${parsed.error.message}\nReply with the corrected JSON only.` },
			],
			AnalysisSchema,
			{ ai, tag: "translate/pass2-repair" },
		)
	).value;
}
