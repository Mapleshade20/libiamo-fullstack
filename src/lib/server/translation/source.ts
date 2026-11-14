// Translation scenarios (item 2, 2026-11-07): the learner translates a text in their own language back into the language
// it was first written in, so the authentic text is the native version the passes compare with. The source used to be
// three model translations to pick from; they drifted from the original and mistranslated fandom names, and the learner
// could not tell which was faithful (they never see the original). Now: one source per scenario and native language,
// written from the original's points with its names kept, checked by a blind back-translation, repaired once. The scenario
// carries a glossary of the names and terms the learner is not expected to know; its glosses come from the same call
// as the source, so both use the same words.
import { z } from "zod";
import { type Caller, chat, chatJson } from "#lib/server/llm/caller.ts";
import { LANG_NAMES, type Lang } from "#lib/server/revision/draft.ts";

export type Term = { term: string; kind: "name" | "term"; note: string };
export type Gloss = { term: string; gloss: string; shown: string };

const TermsSchema = z.object({ terms: z.array(z.object({ term: z.string(), kind: z.enum(["name", "term"]), note: z.string() })) });

/** The names and terms a reader of the original needs but a learner is not there to learn (once per scenario, target only). */
export async function extractTerms(original: string, target: Lang, context: string, ai: Caller) {
	const T = LANG_NAMES[target];
	const user = [
		`A ${T} text from ${context}:`,
		"<<<",
		original,
		">>>",
		"",
		`List the words a learner translating this into ${T} could not be expected to know or find: names (people, characters, places, groups, titles) and terms of this community or field (fandom vocabulary, jargon, a word used in a special sense here). Not ordinary vocabulary, however advanced, and not the words any regular of this community uses every day ("lore", "pairing" in a fandom): those are what the learner is there to pick up. Terms are narrow jargon a newcomer could not produce. Each with kind "name" or "term" and a short note in ${T} saying what it is here (for a term, what it means in this community). A note says only what this text itself shows (who a name is to the others in it, what happens to them here); never add facts about a work or a person from memory, which are often wrong. When the text says little, the note says little ("a character in the story").`,
		'Reply with JSON only: {"terms":[{"term":"exactly as written in the text","kind":"name|term","note":""}]}',
	].join("\n");
	return (await chatJson([{ role: "user", content: user }], TermsSchema, { ai, effort: "low", tag: "translate/terms" })).value.terms;
}

const SourceSchema = z.object({
	points: z.array(z.array(z.string())),
	source: z.array(z.string()),
	glossary: z.array(z.object({ term: z.string(), shown: z.string(), gloss: z.string() })),
});

/**
 * The source in the learner's language: the original's points first (what is said, paragraph by paragraph), then a
 * text a native writer of that language would write to say exactly them, in the original's register. Names stay as
 * the original writes them; a term is rendered the way this community says it in that language when there is a usual
 * way, else kept. The glossary says, for each term, how the source shows it and what it means.
 */
/** names: how the work's name table (names.ts) says to write a name or term in this language; null keeps the original. */
export async function makeSource(
	original: string[],
	terms: Term[],
	target: Lang,
	native: Lang,
	context: string,
	ai: Caller,
	names: Map<string, string | null> = new Map(),
) {
	const T = LANG_NAMES[target];
	const N = LANG_NAMES[native];
	const user = [
		`An original ${T} text from ${context}, by paragraph:`,
		...original.map((p, i) => `[${i + 1}] ${p}`),
		"",
		`Names and terms in it:\n${terms.map((t) => `- ${t.term} (${t.kind}): ${t.note}`).join("\n") || "(none)"}`,
		"",
		`A learner whose own language is ${N} will be given a ${N} version and asked to write it in ${T}; their ${T} is then compared with this original. So the ${N} version must say exactly what the original says, no more and no less, or they are marked down for following it.`,
		"",
		`1. points: for each paragraph, every point it makes, as short plain ${N} notes (what is said, its attitude and emphasis; not how it is phrased).`,
		`2. source: for each paragraph, the ${N} text a native ${N} writer in the same kind of place would write to say exactly those points, in the same register (casual stays casual, a rant stays a rant). Natural ${N}, not translationese: rebuild sentences the way ${N} says things rather than following ${T} word order or idioms. Every point, nothing added. ${names.size ? `These names and terms are written exactly as listed (settled for ${N} readers of this community): ${[...names].map(([t, r]) => `${t} → ${r ?? "as in the original"}`).join("; ")}. Any other name` : "Names are"} written exactly as in the original (in ${T}). A term is written the way ${N}-speaking members of this community usually say it if there is a settled way; otherwise kept in ${T}.`,
		`3. glossary: one entry per name and term listed above: term (as in the original), shown (exactly as it appears in your source), gloss (a short ${N} note: what it is here; for a name, who or what it names). Like the notes above, only what the text itself shows.`,
		'Reply with JSON only: {"points":[["..."]],"source":["paragraph 1","paragraph 2"],"glossary":[{"term":"","shown":"","gloss":""}]}',
	].join("\n");
	return fixNames((await chatJson([{ role: "user", content: user }], SourceSchema, { ai, tag: "translate/source" })).value, terms, names);
}

/**
 * Names stay as the original writes them, whatever the model did: it renders some names in the learner's language
 * (and wrongly: Tawnypelt became 玳瑁毛, the books' Chinese name is 褐皮) and keeps others, and the check does not
 * catch it. Every rendering of a name, in the source and the glosses, goes back to the original's spelling.
 */
export function keepNames<T extends { source: string[]; glossary: Gloss[] }>(r: T, terms: Term[]): T {
	return fixNames(r, terms, new Map());
}

/**
 * The same, with the work's name table: a name or term the table settles is written as it says (褐皮 for Tawnypelt,
 * whether the model kept the English or wrote its own guess), any other name as the original writes it.
 */
export function fixNames<T extends { source: string[]; glossary: Gloss[] }>(r: T, terms: Term[], names: Map<string, string | null>): T {
	const want = new Map<string, string>();
	for (const t of terms) if (t.kind === "name") want.set(t.term, t.term);
	for (const [t, rendering] of names) want.set(t, rendering ?? t);
	// What to replace: the model's own rendering (from its glossary) and, for a localised name, the original spelling.
	const swaps: [string, string][] = [];
	for (const g of r.glossary) {
		const w = want.get(g.term);
		if (w && g.shown && g.shown !== w) swaps.push([g.shown, w]);
	}
	for (const [t, w] of want) if (w !== t) swaps.push([t, w]);
	swaps.sort((a, b) => b[0].length - a[0].length);
	// Longest first, through placeholders, so a replacement is never replaced again ("Leafpool" inside a rendering).
	const fix = (s: string) => {
		const held: string[] = [];
		let out = s;
		for (const [from, to] of swaps) out = out.split(from).join(`\u0000${held.push(to) - 1}\u0000`);
		// biome-ignore lint/suspicious/noControlCharactersInRegex: NUL brackets this function's own placeholders
		return out.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]);
	};
	return { ...r, source: r.source.map(fix), glossary: r.glossary.map((g) => ({ ...g, shown: want.get(g.term) ?? g.shown, gloss: fix(g.gloss) })) };
}

const DriftSchema = z.object({
	issues: z.array(
		z.object({
			paragraph: z.number(),
			kind: z.enum(["missing", "added", "changed", "name", "register"]),
			original: z.string(),
			source: z.string(),
			note: z.string(),
		}),
	),
});

/** Read back blind (a translation of the source alone), then compared with the original paragraph by paragraph. */
export async function checkSource(original: string[], source: string[], terms: Term[], target: Lang, native: Lang, ai: Caller) {
	const T = LANG_NAMES[target];
	const N = LANG_NAMES[native];
	const back = await chat(
		[
			{
				role: "user",
				content: `Translate this ${N} text into ${T}, paragraph by paragraph, closely, keeping names as written. Reply with the paragraphs only, numbered [1], [2]…\n\n${source.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}`,
			},
		],
		{ ai, effort: "low", tag: "translate/back" },
	);
	const user = [
		`An original ${T} text, a ${N} version of it, and a close translation of that ${N} version back into ${T} (made without seeing the original).`,
		`Original:\n${original.map((p, i) => `[${i + 1}] ${p}`).join("\n")}`,
		`${N} version:\n${source.map((p, i) => `[${i + 1}] ${p}`).join("\n")}`,
		`Back-translation:\n${back.text.trim()}`,
		`Names and terms: ${terms.map((t) => t.term).join(", ") || "(none)"}`,
		"",
		`List every place where a reader of the ${N} version would take away something the original does not say: a point missing, a point added, a meaning changed (who did what, what is compared, praise turned to blame, a claim turned into a question or a hedge), a name or term changed or mistranslated. Use the back-translation to see what that reader takes away, but it is a translation too: report only what the ${N} version itself says differently (quote its words), never what the back-translation alone added, dropped or misspelt. Not issues: wording that differs but says the same, a feeling a shade stronger or milder ("like" for "love", "smash" for "undermine"), and a register that fits the same kind of place in ${N} (a casual rant stays casual in its own way). kind: missing | added | changed | name | register; original and source: the words concerned; note: what is off, in English.`,
		'Reply with JSON only: {"issues":[]}',
	].join("\n");
	const r = await chatJson([{ role: "user", content: user }], DriftSchema, { ai, effort: "low", tag: "translate/check" });
	return { issues: r.value.issues, back: back.text.trim(), calls: [back, ...r.calls] };
}

/** One repair: the paragraphs with issues rewritten, the others kept as they are. */
export async function repairSource(
	original: string[],
	source: string[],
	issues: z.infer<typeof DriftSchema>["issues"],
	target: Lang,
	native: Lang,
	ai: Caller,
) {
	const T = LANG_NAMES[target];
	const N = LANG_NAMES[native];
	const user = [
		`Original ${T}:\n${original.map((p, i) => `[${i + 1}] ${p}`).join("\n")}`,
		`${N} version:\n${source.map((p, i) => `[${i + 1}] ${p}`).join("\n")}`,
		`Where the ${N} version does not say what the original says:\n${issues.map((x) => `- [${x.paragraph}] ${x.kind}: "${x.original}" / "${x.source}": ${x.note}`).join("\n")}`,
		"",
		`Rewrite only what these issues need so the ${N} version says exactly what the original says, still natural ${N} in the same register, names as in the original. Every other word stays as it is.`,
		'Reply with JSON only: {"source":["paragraph 1","paragraph 2"]}',
	].join("\n");
	return (await chatJson([{ role: "user", content: user }], z.object({ source: z.array(z.string()) }), { ai, tag: "translate/repair" })).value.source;
}
