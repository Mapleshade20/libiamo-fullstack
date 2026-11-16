import { z } from "zod";
import { type Caller, type CallResult, chat, chatJson } from "#lib/server/llm/caller.ts";
import { type Draft, fbName, LANG_NAMES, levelLine, noteLines, readerFrame } from "#lib/server/revision/draft.ts";
import { MISREAD, REGISTER } from "#lib/server/revision/pass1/context.ts";

export type Sentence = { id: number; from: number; to: number; text: string; para: number };

/** Number the sentences of a text, so the model can point at them without quoting. */
export function sentences(text: string, lang: string): Sentence[] {
	const seg = new Intl.Segmenter(lang, { granularity: "sentence" });
	const out: Sentence[] = [];
	let para = 0;
	let offset = 0;
	for (const block of text.split("\n\n")) {
		for (const s of seg.segment(block)) {
			const t = s.segment.trim();
			if (!t) continue;
			const from = offset + s.index + s.segment.indexOf(t);
			out.push({ id: out.length + 1, from, to: from + t.length, text: t, para });
		}
		offset += block.length + 2;
		para += 1;
	}
	return out;
}

type SpotWhere = { sentences: number[]; phrase?: string | null; quote?: string | null; scope?: "words" | "sentence" | "sentences" | null };

/**
 * A spot's range in `text`. v6 spots anchor on the quoted words, found by code (preferring the listed sentences), and
 * widen to their sentence or the listed sentences by scope; earlier versions use the phrase inside the sentences.
 */
export function spotRange(text: string, ss: Sentence[], s: SpotWhere): [number, number] {
	const quote = s.quote;
	if (quote) {
		const listed = ss.filter((x) => s.sentences.includes(x.id));
		const find = (from: number, to: number) => {
			const i = text.indexOf(quote, from);
			return i >= 0 && i + quote.length <= to ? i : -1;
		};
		let at = -1;
		for (const x of listed) {
			at = find(x.from, x.to);
			if (at >= 0) break;
		}
		if (at < 0) at = text.indexOf(quote);
		if (at >= 0) {
			const end = at + quote.length;
			if (s.scope === "words") return [at, end];
			const own = ss.filter((x) => x.from < end && x.to > at);
			const cover = s.scope === "sentences" ? [...own, ...listed.filter((x) => x.para === own[0]?.para)] : own;
			return [Math.min(at, ...cover.map((x) => x.from)), Math.max(end, ...cover.map((x) => x.to))];
		}
	}
	const inS = ss.filter((x) => s.sentences.includes(x.id));
	if (!inS.length) return [-1, -1];
	if (s.phrase) {
		for (const x of inS) {
			const i = text.indexOf(s.phrase, x.from);
			if (i >= 0 && i < x.to) return [i, i + s.phrase.length];
		}
	}
	return [inS[0].from, inS[inS.length - 1].to];
}

/** The prompt line for the spans pass 1 left for pass 2 (pipeline/base.ts). */
export const leftLine = (left: string[]) =>
	left.length
		? `The first pass left these words as the writer wrote them, because fixing them needs something only the writer can decide; each must be inside one of your spots: ${left.map((x) => `«${x}»`).join("; ")}.`
		: "";

export function numbered(ss: Sentence[]): string {
	let para = -1;
	return ss
		.map((s) => {
			const gap = s.para !== para && para >= 0 ? "\n" : "";
			para = s.para;
			return `${gap}[S${s.id}] ${s.text}`;
		})
		.join("\n");
}

const Reading = z.object({ label: z.string(), meaning: z.string() });
export const AnalysisSchema = z.object({
	/** v5: one row per draft sentence, written before the spots so every sentence is compared. */
	scan: z.array(z.object({ s: z.number(), fluent: z.string(), differs: z.enum(["none", "word", "structure"]) })).optional(),
	gist: z.string(),
	map: z.array(
		z.object({
			role: z.string(),
			what: z.string(),
			sentences: z.array(z.number()),
			status: z.enum(["ok", "fix", "missing"]),
			note: z.string().optional(),
		}),
	),
	spots: z.array(
		z.object({
			kind: z.enum(["meaning", "formulation"]).optional(),
			quote: z.string().nullable().optional(),
			tier: z.enum(["better"]).optional(),
			sentences: z.array(z.number()).default([]),
			phrase: z.string().nullable().optional(),
			problem: z.string(),
			scope: z.enum(["words", "sentence", "sentences"]).nullable().optional(),
			question: z.string().nullable().optional(),
			mode: z.enum(["one", "ask"]),
			readings: z.array(Reading),
		}),
	),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Pass2Run = { analysis: Analysis; calls: CallResult[]; artifacts: Record<string, string> };

function context(d: Draft, ss: Sentence[], left: string[] = []) {
	return [
		`Target language: ${LANG_NAMES[d.target]}. The writer's own language: ${LANG_NAMES[d.learner]}.${levelLine(d)}`,
		`Where it will be posted: ${d.scene.platform}. Who will read it: ${d.scene.audience}. What the writer wants to do: ${d.scene.purpose}.`,
		...noteLines(d),
		d.title ? `Title (context only; spots are only ever in the numbered sentences): ${d.title}` : "",
		"",
		`The writer's draft. A separate pass fixes its small language errors (grammar, articles, tense, wrong words); ignore those. Passages in ${LANG_NAMES[d.learner]} are things the writer could not yet say; "a/b" marks a choice they have not made. Sentences are numbered:`,
		"",
		numbered(ss),
		leftLine(left),
	]
		.filter((l) => l !== "")
		.join("\n");
}

// v6: each spot starts from the words a reader stumbles on, and its problem is written right after them, so long spot
// lists cannot shift problems onto the wrong span; code finds the words and widens them by scope (E8).
export const TASK_V6 = (d: Draft) => {
	const T = LANG_NAMES[d.target];
	const L = LANG_NAMES[d.learner];
	const F = fbName(d);
	return `Small language errors are handled separately. Now find every place worth a second pass. There are two kinds of spot.

kind "meaning": the post cannot do its job until the writer decides something only they know:
- passages still in ${L} that are whole clauses (the writer will build them in ${T} themselves), and "a/b" choices;
- a point the reader needs but the post leaves unstated (a conclusion the evidence is meant to support, the actual question);
- a connective or framing word whose relation (contrast, concession, cause, addition) does not match the ideas it joins, or whose other half never comes;
- wording that readers could take another way than the writer means, as defined below;
- wording off in register, as defined below: read as meant, but not how to speak to these readers.

kind "formulation": the meaning comes through, but a fluent writer would package it differently, and the difference is worth learning: the order of information, where the emphasis falls, a comparison that is not like for like, chains of nouns where ${T} would use a verb or a clause, an image, joke or set phrase carried over from ${L} that a ${T} reader would take literally or not recognise, praise or criticism framed from an angle this community would not use, quoted or reported words not built into the sentence, a sentence or passage carrying too much at once. Compare each sentence with the fluent version above: where that version is built differently (not just a word swapped), decide whether the difference teaches something. List every such place; the writer will skip what they do not want. Word-level fixes with one obvious answer are not spots.

${MISREAD}

${REGISTER}

Skip anything that is a matter of taste only. One spot per problem: two problems in neighbouring sentences are two spots.

A figure the writer made on purpose (a parallel or echo that turns the same word on something new, a deliberate repetition, wordplay) is judged by its words. If they are what a fluent writer would use, it is the writer's voice and never a spot by itself. If a word in it is not (a ${T} reader would stop at it), that word is a spot like any other, and its problem says both that the figure works and why that word does not.

For each spot, in this order:
- kind.
- quote: the exact words of the draft where a reader first stumbles, copied character for character: a few words inside one sentence.
- problem: in ${F}, as the tutor who just read it, one or two sentences: starting from the quoted words, what a ${T} reader expects or understands on reaching them and why (what those words normally do in ${T}), and what is then missing, off or hard to follow. Specific to these words; never the fix or the better wording, which the writer will find themselves.
- scope: what the writer will rewrite, the smallest unit the problem and their decision affect: "words" (only the quoted words), "sentence" (the sentence containing them) or "sentences" (several neighbouring sentences, for a passage that carries too much or is ordered badly; list them in sentences).
- sentences: the numbers of the sentences the scope covers.
- question: the one thing the writer must tell you about what they mean here, as a short ${F} question.
- mode and readings: what the writer might mean, in ${F}. Readings must be genuinely different meanings that would be written differently in ${T}; if there is no second reading like that, give one. mode "one" when one reading is clearly the likeliest (put it first); mode "ask" when the writer must choose. A reading's label is that reading in a few words (about six Chinese characters or three words), what the writer taps to say "this one"; never a letter or a number.

Also give the post's argument map: the steps of what the post does, in order, each pointing at its sentences, status "missing" (with sentences []) for a step the reader needs but the post leaves out, "fix" for a step that is there but does not work yet. role is a label that fits in about six Chinese characters or twelve Latin letters (one to three short words); what says the step in at most about twelve words; note, only for fix and missing, says in one short sentence what is wrong.

All writer-facing text (gist, role, what, note, problem, question, readings) in ${F}, short.`;
};

export const SHAPE_V6 = `{"scan":[{"s":1,"fluent":"the words in the fluent version that say what sentence 1 says","differs":"none|word|structure"}],"gist":"what the post is really asking or saying","map":[{"role":"...","what":"...","sentences":[1],"status":"ok|fix|missing","note":"..."}],"spots":[{"kind":"meaning|formulation","quote":"exact words","problem":"...","scope":"words|sentence|sentences","sentences":[1],"question":"...","mode":"one|ask","readings":[{"label":"...","meaning":"..."}]}]}`;
export const SCAN_RULE =
	"First fill scan: one row for every numbered sentence, in order, with the matching words from the fluent version and whether it is built the same (none), differs only in words (word), or is built differently (structure). Every structure row must then be judged for a formulation spot.";

const SYSTEM = (d: Draft) =>
	`You are a ${LANG_NAMES[d.target]} writing tutor. You help writers make their posts say what they mean, for the people who will read them.`;

// The analysis: the argument written out first (including what it leaves implicit), then map it.
export async function analyze(d: Draft, text: string, ai: Caller, sample: number, native?: string, left: string[] = []): Promise<Pass2Run> {
	const ss = sentences(text, d.target);
	const fluent = native ? `\n\nA fluent writer's version of the same post, for comparison (not to be copied wholesale):\n<<<\n${native}\n>>>` : "";
	const user = `${context(d, ss, left)}${fluent}\n\n${TASK_V6(d)}\n\nWork in two steps.\n\nStep 1. Under "### ARGUMENT", write out in plain prose what this writer is trying to get across, step by step, including the steps and the real question they leave implicit. Then say, for each step, whether a reader who has only the post would get it.\n\nStep 2. Under "### JSON", give the analysis:\n${SCAN_RULE}\n${SHAPE_V6}`;
	const res = await chat(
		[
			{ role: "system", content: SYSTEM(d) },
			{ role: "user", content: user },
		],
		{ ai, sample, tag: "e2/t2" },
	);
	const argument = res.text.match(/###\s*ARGUMENT\s*\n([\s\S]*?)(?=\n###\s*JSON)/)?.[1]?.trim() ?? "(missing)";
	const json = res.text.split(/###\s*JSON/)[1] ?? res.text;
	const parsed = AnalysisSchema.safeParse(extract(json));
	if (parsed.success) return { analysis: parsed.data, calls: [res], artifacts: { argument } };
	const fixed = await chatJson(
		[
			{ role: "system", content: SYSTEM(d) },
			{ role: "user", content: user },
			{ role: "assistant", content: res.text },
			{ role: "user", content: `The JSON did not validate:\n${parsed.error.message}\nReply with the corrected JSON only.` },
		],
		AnalysisSchema,
		{ ai, sample, tag: "e2/t2/repair" },
	);
	return { analysis: fixed.value, calls: [res, ...fixed.calls], artifacts: { argument } };
}

function extract(t: string): unknown {
	try {
		const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
		const body = (fenced ? fenced[1] : t).trim();
		return JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
	} catch {
		return null;
	}
}

/** The reader's honest first reaction. They see only the post, never the writer's background or intent. */
/** The reader's seat: the one person a message is written to (an email, a letter, a DM), else a regular of the place. */
export const readerSeat = (d: Pick<Draft, "scene" | "target">) =>
	`You read ${LANG_NAMES[d.target]} only. If this post is written to one particular person (an email, a letter, a direct message), you are that person (${d.scene.audience}), reading what was written to you; otherwise you are a regular on ${d.scene.platform}.`;

export async function readBack(d: Draft, text: string, ai: Caller, sample: number): Promise<CallResult> {
	const system = readerSeat(d);
	const frame = readerFrame(d);
	const user = `${frame ? `${frame}\n\nThe post (the reply):\n` : ""}${d.title ? `${d.title}\n\n` : ""}${text}\n\nYou just read this post. Write the first thing you would write back (or reply in the thread): one or two short sentences in ${LANG_NAMES[d.target]}, in your own voice, that says back what you understood them to be asking or saying, so they can tell whether you got it. If something was unclear to you, say how you read it. Reply with the reply only.`;
	return chat(
		[
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		{ ai, sample, effort: "low", tag: "e2/reader" },
	);
}
