import { z } from "zod";
import { type Caller, type CallResult, chatJson } from "#lib/server/llm/caller.ts";
import { aLearner, type Draft, fbName, LANG_NAMES, noteLines, pinLang } from "#lib/server/revision/draft.ts";
import { VOICE } from "#lib/server/revision/pass1/context.ts";
import { words } from "#lib/text/words.ts";

/** What C5 needs: the spot as the plan stated it and the reading the writer chose. */
/** wide: the reference may replace the whole sentences the spot is in (no other stop is there); else only the spot. */
export type SpotInput = { sentences: string; phrase?: string; problem: string; reading: string; mode: "one" | "ask" | "given"; wide?: boolean };

// Field order is generation order: the reference sentence is written before anything is derived from it.
export const MaterialSchema = z.object({
	reader: z.string(),
	replaces: z.string(),
	keep: z.array(z.string()).optional(),
	ref: z.string(),
	alts: z.array(z.string()),
	pieces: z.array(z.string()),
	construct: z.string(),
	why: z.array(z.object({ label: z.string(), note: z.string() })),
	checks: z.array(z.object({ problem: z.string(), reader: z.string().nullable().optional(), hint: z.string(), tell: z.string() })),
	success: z.string(),
	prompt: z.string(),
});
export type Material = z.infer<typeof MaterialSchema>;

/** authentic: in a translation, the text as first written (the source is in the draft's notes). */
/** fix: what code found wrong with the last answer, when it is asked again. */
export async function material(
	d: Draft,
	text: string,
	spot: SpotInput,
	ai: Caller,
	sample: number,
	authentic?: string,
	fix?: string,
): Promise<{ value: Material; calls: CallResult[] }> {
	const T = LANG_NAMES[d.target];
	const L = LANG_NAMES[d.learner];
	const F = fbName(d);
	const system = `You coach ${aLearner(d)} of ${T} (their own language is ${L}) who is rewriting part of a real post before publishing it. Two people talk to them: a reader from the community, who speaks ${T} and reacts like a real person in the thread, and a tutor, who speaks ${F} and addresses the learner informally, as a friendly tutor would. ${pinLang(d)}`;
	const user = [
		`Where it will be posted: ${d.scene.platform}. Readers: ${d.scene.audience}.`,
		...noteLines(d),
		d.title ? `Title: ${d.title}` : "",
		"",
		"The post so far:",
		"<<<",
		text,
		">>>",
		"",
		`The spot: ${spot.phrase ? `"${spot.phrase}" in ` : ""}${spot.sentences}`,
		`What is wrong there: ${spot.problem}`,
		`What the writer means (confirmed by them): ${spot.reading}`,
		// A translation's meaning is the source's: a reference that adds to it ("no buildup" → "no buildup or
		// foreshadowing, it comes out of nowhere") teaches the learner to say what the source never said.
		authentic
			? `This is a translation of the source in the notes above: ref says exactly what the source says for this part, nothing it does not say (no added detail, image or emphasis). Where this text, as a fluent member of the community first wrote it, covers this part, it shows how they said it; take its wording unless the writer's own already works:\n<<<\n${authentic}\n>>>`
			: "",
		"",
		`The learner will now write this part themselves in ${T}. Prepare everything the session needs, in this order:`,
		`- reader: what the reader says on reaching this spot as it stands: one short line in ${T} (at most 15 words), in character (puzzled, curious, teasing; never a teacher). The reader cannot read ${L}: an untranslated passage is simply a gap to them, so react to what is missing and never mention the other language.`,
		// Code sets what may be replaced (2026-11-10): a reference that chose its own span swallowed other stops.
		spot.wide === undefined
			? `- replaces: the exact text in the post that the reference will replace, copied character for character: the smallest span this spot needs, never text that belongs to another problem. Whole sentences when the problem is how a sentence or passage is built.`
			: spot.wide && spot.phrase && spot.phrase !== spot.sentences
				? `- replaces: the exact text the reference will replace, copied character for character, one of two: the spot itself, "${spot.phrase}"; or, when the spot cannot be put right without changing the words around it or the problem is how the sentence is built, the whole of: "${spot.sentences}". Nothing else.`
				: `- replaces: exactly "${spot.phrase ?? spot.sentences}", copied character for character (the text around it is someone else's business). ref must fit in its place.`,
		`- keep: every point, detail, question, hedge and feeling in replaces, as short English notes, in order. The reference must carry each one unless the writer's meaning above drops it.`,
		`- ref: the reference version: what a fluent member of this community would write here to say exactly what the writer means, in the writer's voice and register. Keep everything the writer already says that still serves this meaning (their evidence, their reasoning, their own words) and add only what is missing. Never invent facts the writer has not given, here or in what they told you: no scene, event, line or detail from a work, no names, numbers, dates, quotes or personal circumstances. Where the meaning needs one (the evidence, which scene, what happened to them), write a short placeholder in its place, in ${T}, between ⟨ and ⟩ (for example ⟨the scene you mean⟩), and the writer will fill it in. Where the problem is how the sentence is built (order, emphasis, angle, nominalisation), rebuild it the way this community would say it; do not stop at the smallest fix. Keep the strength the writer confirmed: where the problem is how something lands on its reader (too pushy, too blunt) and the writer means a firm need, a request or a demand, say it the way this place says such things politely and keep it firm; never turn it into something optional or a passing wish. Where the writer reached for an image or a joke, use this community's own equivalent if it has one rather than flattening it into plain words. Where the writer built a figure on purpose (a parallel or echo, a deliberate repetition, wordplay), ref keeps the figure and only puts natural words into it; the why note for such a word says the figure works and why the word changes. ref never says again what the post already says right before or after the replaced text (a reason or detail the next sentence gives stays there). ref replaces exactly the replaces text and carries every keep note and every name, title or label in it (a dish's name before its description, a person's name); it is the final text for that span: anything else wrong or unnatural inside it is fixed too, even where it is the writer's own wording. ${VOICE(d)} ref keeps that voice. Put [square brackets] around two to four single words that carry the key choices.`,
		`- alts: one or two other natural ways to say it, without brackets.`,
		`- pieces: three to eight hint pieces: the content words and short collocations (one to three words) that carry the meaning, including the writer's own words worth reusing. Each piece is ${T} words only: no grammar notes, glosses, symbols or instructions. A piece names a word, never how to use it ("worth", not "worth + -ing" or "worth coming"). Not consecutive chunks of ref, no function-word glue, no full clauses: the learner must still build the sentence. "x / y" offers a fork.`,
		`- construct: the one reusable pattern this spot teaches, as a learner would jot it in a notebook: at most eight words, a ${T} frame with one placeholder ("X left him + adjective", "What really got me was …"), optionally a short ${F} gloss. Not a grammar formula.`,
		`- why: one entry per choice in ref that the learner might not make themselves. label: the ${T} words; note, in ${F}: why this choice here, contrasted with what the learner wrote or would likely write, with a nuance or a tiny example when it helps. Concrete and specific, never "more natural" or "more appropriate" alone.`,
		`- checks: the mistakes this learner is likely to make on a first try, most important first: missing a part of the meaning, a structure carried over from ${L}, the specific error already in their draft, a wrong word for this sense. For each: problem (what the grader should look for, in English); reader (optional: how the reader reacts when it happens, one ${T} line in character, only when the meaning really suffers); hint (${F}: a nudge that points at the gap without giving the words); tell (${F}: says the fix plainly, with the words).`,
		`- success: the reader's reaction once the learner gets it right: in ${T}, in character, at most 12 words, a reaction to what is now said (not a summary of it).`,
		`- prompt: the tutor's instruction in ${F} to start writing: one short sentence that fits the size of the spot (a clause, a sentence, a passage). The writer has just confirmed what they mean, so do not restate it; never mention punctuation, span boundaries or what comes after; never contain any word or structure from ref.`,
		"",
		'Reply with JSON only: {"reader":"","replaces":"","keep":[],"ref":"","alts":[],"pieces":[],"construct":"","why":[{"label":"","note":""}],"checks":[{"problem":"","reader":null,"hint":"","tell":""}],"success":"","prompt":""}',
		fix ? `\nAn earlier answer was not usable: ${fix} Mind that this time.` : "",
	]
		.filter((l) => l !== "")
		.join("\n");
	return chatJson(
		[
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		MaterialSchema,
		{ ai, sample, tag: "e3/material" },
	);
}

/**
 * The reference is asked for "the smallest span this spot needs", but often comes back for more: the whole menu line for
 * a spot on "Hot red wine", so the retrieval then wanted the spices and "non-alcoholic" back as well, or a span starting
 * inside the previous sentence ("stone. Maybe the clouds…"). Words the reference repeats unchanged at either end are
 * dropped from both, at word boundaries, never cutting into the spot itself.
 */
export function trimSame<M extends Pick<Material, "replaces" | "ref" | "alts">>(m: M, text: string, spotFrom: number, spotTo: number): M {
	const r = m.replaces;
	const at = text.indexOf(r, Math.max(0, spotFrom - r.length));
	if (at < 0 || !r) return m;
	// The reference without its key-word brackets, and where each of its characters sits in the bracketed one.
	const map: number[] = [];
	let plain = "";
	for (let i = 0; i < m.ref.length; i++) {
		if (m.ref[i] === "[" || m.ref[i] === "]") continue;
		map.push(i);
		plain += m.ref[i];
	}
	map.push(m.ref.length);
	let p = 0;
	while (p < r.length && p < plain.length && r[p] === plain[p]) p++;
	// Cut only between clauses, or what is left reads as a fragment ("…cloves, good" for "…good for rainy days"): the
	// common start must end with punctuation and a space, the common end start with a space and a bracket or punctuation.
	// A lone final full stop is not worth a cut.
	const headOk = (k: number) => k === 0 || (/[.!?。！？:;,)”"]\s+$/.test(r.slice(0, k)) && /\p{L}/u.test(r.slice(0, k)));
	const tailOk = (k: number) => k === 0 || (/^\s+[(“"]|^[,.;:!?。！？]/.test(r.slice(r.length - k)) && /\p{L}/u.test(r.slice(r.length - k)));
	p = Math.min(p, Math.max(0, spotFrom - at));
	while (p > 0 && !headOk(p)) p--;
	let q = 0;
	while (q < r.length - p && q < plain.length - p && r[r.length - 1 - q] === plain[plain.length - 1 - q]) q++;
	q = Math.min(q, Math.max(0, at + r.length - spotTo));
	while (q > 0 && !tailOk(q)) q--;
	if (!p && !q) return m;
	const head = r.slice(0, p);
	const tail = r.slice(r.length - q);
	const replaces = r.slice(p, r.length - q).trim();
	// A key word's brackets stay with it: an opening one just before the start, a closing one just after the end.
	let start = map[p];
	while (start > 0 && m.ref[start - 1] === "[") start--;
	const e = plain.length - q;
	let end = e > 0 ? map[e - 1] + 1 : 0;
	while (m.ref[end] === "]") end++;
	const ref = m.ref.slice(start, end).trim();
	if (!replaces || !ref) return m;
	const cut = (a: string) => {
		let x = a;
		if (head && x.startsWith(head)) x = x.slice(head.length);
		if (tail && x.endsWith(tail)) x = x.slice(0, x.length - tail.length);
		return x.trim();
	};
	return { ...m, replaces, ref, alts: m.alts.map(cut) };
}

/** A piece is the learner's own when all its words are already in the draft; code decides, not the model. */
export function pieceOwnership(draft: string, piece: string): "own" | "new" {
	const have = new Set(words(draft).map((x) => x.w));
	const forks = piece.split("/").map((f) => words(f).map((x) => x.w));
	return forks.every((ws) => ws.length && ws.every((w) => have.has(w))) ? "own" : "new";
}

/**
 * C5v: a second look at the reference from the community's side. Material is asked for the final text of its span, so
 * it also rewrites words outside the problem the writer confirmed, and states a reason for each ("noun stacking",
 * 2026-10-25, about "feeling gratitude for", which is fine). Nobody checked those reasons, and the grader then told the
 * writer the opposite. Each reason against the writer's own words is checked here; where it does not hold, their words
 * go back into the reference, so the reference, its explanation and the grade say the same thing.
 */
const VetSchema = z.object({
	verdicts: z.array(
		z.object({ n: z.number(), holds: z.boolean(), why: z.string(), label: z.string().nullable().optional(), note: z.string().nullable().optional() }),
	),
	ref: z.string().nullable().optional(),
	alts: z.array(z.string()).nullable().optional(),
	checks: z.array(z.number()).nullable().optional(),
});
export async function vetMaterial(
	d: Draft,
	text: string,
	spot: SpotInput,
	m: Material,
	ai: Caller,
	sample: number,
): Promise<{ value: Material; dropped: { label: string; why: string }[]; calls: CallResult[] }> {
	if (!m.why.length) return { value: m, dropped: [], calls: [] };
	const T = LANG_NAMES[d.target];
	const user = [
		`You are a fluent, native ${T} speaker and a regular of ${d.scene.platform}. Its readers: ${d.scene.audience}.`,
		...noteLines(d),
		"A learner is revising this post:",
		"<<<",
		text,
		">>>",
		"",
		`Their words: "${m.replaces}"`,
		`The problem the tutor found there: ${spot.problem}`,
		`What the writer means (confirmed by them): ${spot.reading}`,
		`The tutor's version: "${m.ref.replace(/[[\]]/g, "")}"`,
		"",
		"The tutor's choices, numbered, with the reason given for each:",
		m.why.map((w, i) => `${i + 1}. ${w.label}: ${w.note}`).join("\n"),
		"",
		`Tutors who know the writer is learning ${T} tend to rewrite natural wording too. For each choice: holds is true when the choice fixes the problem above or carries the writer's meaning, or when the writer's own words it replaces really are wrong or unnatural here (a fluent regular would not write them, or readers would take them differently). holds is false when it replaces words of the writer's that regulars here write and readers take as meant: a matter of taste, however the reason puts it. why: one short English sentence. note: when the choice holds but its reason says something untrue about the writer's words, the reason rewritten to say only what is true, in the reason's language, addressed to the writer as the tutor would say it (the new reason itself, never a remark about the old one such as "the reason should be…"); else null.`,
		`If any choice does not hold: ref: the tutor's version with the writer's own words put back at those places (adjusted only as the grammar of the new sentence requires), keeping the [square brackets] the tutor put around key words that remain; alts: the tutor's other versions below, changed the same way; and for each choice that holds, label: its words exactly as they now read in your ref. Else ref and alts null.`,
		m.alts.length ? `Other versions: ${m.alts.map((a) => `"${a}"`).join("; ")}` : "",
		`checks: numbers of the mistakes below that the grader would only flag because of a choice that does not hold; else null.\n${m.checks.map((c, i) => `${i + 1}. ${c.problem}`).join("\n")}`,
		"",
		'Reply with JSON only: {"verdicts":[{"n":1,"holds":true,"why":""}],"ref":null,"alts":null,"checks":null}',
	]
		.filter((l) => l !== "")
		.join("\n");
	const r = await chatJson([{ role: "user", content: user }], VetSchema, { ai, sample, effort: "low", tag: "e3/vet-material" });
	const of = new Map(r.value.verdicts.map((v) => [v.n - 1, v]));
	// A change that holds keeps its row, with its reason corrected where the reason itself was untrue.
	const why = m.why.map((w, i) => ({ ...w, note: of.get(i)?.holds !== false && of.get(i)?.note?.trim() ? of.get(i)!.note!.trim() : w.note }));
	const off = r.value.verdicts.filter((v) => !v.holds && m.why[v.n - 1]);
	if (!off.length || !r.value.ref?.trim()) return { value: { ...m, why }, dropped: [], calls: r.calls };
	const gone = new Set(off.map((v) => v.n - 1));
	const checksOff = new Set((r.value.checks ?? []).map((n) => n - 1));
	const ref = rebracket(r.value.ref, m.ref);
	return {
		value: {
			...m,
			ref,
			alts: r.value.alts?.length ? r.value.alts : m.alts,
			why: why.flatMap((w, i) => (gone.has(i) ? [] : [{ ...w, label: of.get(i)?.label?.trim() || w.label }])),
			checks: m.checks.filter((_, i) => !checksOff.has(i)),
		},
		dropped: off.map((v) => ({ label: m.why[v.n - 1].label, why: v.why })),
		calls: r.calls,
	};
}

/** The key words of the old reference, bracketed again in a revised one that lost its brackets. */
export function rebracket(ref: string, old: string): string {
	if (/\[[^\]]+\]/.test(ref)) return ref;
	let out = ref;
	for (const [, w] of old.matchAll(/\[([^\]]+)\]/g)) {
		// Whole words only where words have edges (a key word "he" is not the "he" in "the").
		const edge = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u.test(w);
		const at = edge ? out.search(new RegExp(`(?<![\\p{L}\\[])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\]])`, "u")) : out.indexOf(w);
		if (at >= 0) out = `${out.slice(0, at)}[${w}]${out.slice(at + w.length)}`;
	}
	return out;
}
