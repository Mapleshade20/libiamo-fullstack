import { z } from "zod";
import { type Caller, type CallResult, chatJson } from "#lib/server/llm/caller.ts";
import { type Draft, LANG_NAMES } from "../fixtures/types.ts";
import { MISREAD, REGISTER } from "../pass1/context.ts";
import type { Analysis } from "./analyze.ts";

/**
 * C4j: a second look at each pass-2 spot from the community's side (E10, 2026-10-24). The analysis knows the writer is
 * a learner and finds carried-over wording everywhere: on seven comments by fluent writers it raised 41 flags, among
 * them claims that were simply wrong ("hit the spot" would confuse, "dumb" reads as an insult). The judge checks each
 * claim against how regulars there write, and sorts it:
 * - wrong: regulars write exactly this and readers get it. Never shown.
 * - better: a regular could have written it, but a careful writer would put it better. Shown only to writers who asked
 *   to see more, as optional.
 * - needed: shown to everyone.
 * Passages left in the writer's own script and "a/b" choices are theirs to decide; the judge is not asked about them.
 */
const VerdictSchema = z.object({
	verdicts: z.array(
		z.object({ id: z.number(), heard: z.string().nullable().optional(), verdict: z.enum(["wrong", "better", "needed"]), why: z.string() }),
	),
});
const OWN_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Greek}]|\//u;

type Spot = Analysis["spots"][number];

const HeardSchema = z.object({ heard: z.array(z.object({ id: z.number(), heard: z.string() })) });
/**
 * How a regular takes the quoted words on first reading, asked blind: no tutor's claim and no writer's meaning, which
 * anchored the judge when it was asked to say it itself (E13: it then took "just another great line" as "nothing
 * special" with the tutor). The judge compares this with what the writer means.
 */
async function hear(d: Draft, quotes: string[], ai: Caller, sample: number) {
	const T = LANG_NAMES[d.target];
	const user = [
		`You are a fluent, native ${T} speaker and a regular of ${d.scene.platform}, and this post is written to you: you are among its readers (${d.scene.audience}), the one it addresses when it addresses someone.`,
		"Someone posted this there:",
		"<<<",
		d.text,
		">>>",
		"",
		"For each passage below, say what you take from it at the moment you reach it, reading from the start, before what follows: the attitude or feeling toward whoever it is about, what the writer is doing (praising, complaining, joking, asking, demanding, informing), how strongly, and how it lands on you as the one it is said to (pleased, moved, pressured, talked down to, put off, kept at a distance, or nothing in particular). Read it the way you read posts here, knowing how people here use words. One or two short English sentences each.",
		quotes.map((q, n) => `${n + 1}. "${q}"`).join("\n"),
		"",
		'Reply with JSON only: {"heard":[{"id":1,"heard":"..."}]}',
	].join("\n");
	return chatJson([{ role: "user", content: user }], HeardSchema, { ai, sample, effort: "low", tag: "e13/hear" });
}

/** left: the passages pass 1 left as written for the writer (any script: an English aside in a Spanish email too). */
export async function judgeSpots(
	d: Draft,
	spots: Spot[],
	ai: Caller,
	sample: number,
	left: string[] = [],
): Promise<{
	spots: Spot[];
	wrong: { words: string; why: string }[];
	all: { words: string; verdict: string; why: string; heard?: string }[];
	calls: CallResult[];
}> {
	// A spot on a passage pass 1 left for the writer is theirs to decide, whatever its script (2026-11-10: the English
	// aside in a Spanish email was judged "could be better", so it was shown as optional). Only a spot within such a
	// passage: one that reaches past it ("and it would be hard" before "hard / not worth it") makes a claim of its own,
	// and went unchecked to the learner when overlapping was enough.
	const at = (x: string) => {
		const i = x ? d.text.indexOf(x) : -1;
		return i < 0 ? null : [i, i + x.length];
	};
	const spans = left.map(at).filter((x): x is number[] => !!x);
	const onLeft = (w: string) => {
		const r = at(w);
		return !!r && spans.some(([a, b]) => a <= r[0] && r[1] <= b);
	};
	const items = spots
		.map((s, i) => ({ i, words: s.quote ?? s.phrase ?? "", claim: s.problem, meant: s.kind === "meaning" ? s.readings[0]?.meaning : undefined }))
		.filter((x) => x.words && !OWN_SCRIPT.test(x.words) && !onLeft(x.words));
	if (!items.length) return { spots, wrong: [], all: [], calls: [] };
	const asked = items.filter((x) => x.meant);
	const heard = asked.length
		? await hear(
				d,
				asked.map((x) => x.words),
				ai,
				sample,
			)
		: null;
	const heardOf = new Map(asked.map((x, n) => [x.i, heard?.value.heard.find((h) => h.id === n + 1)?.heard]));
	const T = LANG_NAMES[d.target];
	const user = [
		`You are a fluent, native ${T} speaker and a regular of ${d.scene.platform}. Its readers: ${d.scene.audience}.`,
		"Someone posted this there:",
		"<<<",
		d.text,
		">>>",
		"",
		`A writing tutor wants them to change the passages below. The tutor knows the writer is learning ${T}, and tutors who know that tend to see mistakes and carried-over wording everywhere, in perfectly natural writing too. Check each claim against how regulars here actually write:`,
		items
			.map(
				(x, n) =>
					`${n + 1}. "${x.words}"\n   tutor: ${x.claim}${heardOf.get(x.i) ? `\n   a regular reading it fresh took it as: ${heardOf.get(x.i)}` : ""}`,
			)
			.join("\n"),
		"",
		"verdict, one of three:",
		`- "wrong": the tutor is wrong. Regulars here write exactly this (casual or loose grammar, slang, run-on sentences, the community's shorthand, idioms and personal style included), readers here take these words as the writer means (the same attitude, act, claim and strength, as defined below, not merely the point once they read on), the one addressed would not mind them (register, below), and the tutor's version would not read better to them. Also "wrong": which name, nickname or old name the writer calls a character, person or place by, when it is one the work or the people here use: that is the writer's call, not a language problem.`,
		`- "better": a fluent native regular could have written this and readers would get it, but the tutor has a point: a careful writer here would put it better (clearer emphasis, a less clunky sentence, a comparison that lines up, a set phrase the community actually uses).`,
		`- "needed": the tutor is right that it has to change: a fluent native would not write it this way (a word in a sense it does not have, a collocation, structure or set phrase ${T} does not use, a foreign idiom translated word for word, a grammar or agreement error), or readers here would likely take these words another way than meant (as defined below), or they are off in register (as defined below), or a point it needs is missing.`,
		MISREAD,
		REGISTER,
		"Be strict both ways: do not excuse what a native would not write, and do not fault what a native could write.",
		`Where the tutor says readers would take the words another way than the writer means, or that they are off in register, judge the words as a reader reaches them. How a regular reading it fresh took them is given: it is your evidence, do not work it out again. Compare it with what the post as a whole shows the writer means, not with what the tutor supposes they mean (the tutor guesses, and often reads a learner's intent into words that say exactly what their writer wanted). Taken another way means the fresh reading is at odds with the rest of the post in attitude, act, claim or strength: a complaint heard in a post that praises, a demand in one that only hopes. When the fresh reading turns the attitude or the act the other way (a complaint, however mild, where the post praises; a demand where it hopes; doubt where it agrees), the verdict is "needed", even when the words that follow set it right and even when regulars sometimes write it that way. "better" when the direction is the same and only the strength is off. The fresh reading also says how the words land on the one addressed: when they would feel pressured, talked down to, put off or kept at a distance in a way the writer would not want (off in register, as defined above), the verdict is "needed" too, even when some regulars write it that way; that it is common here does not make it welcome. When the fresh reading fits the rest of the post and lands as the writer would want, the words do what the writer wants: "wrong".`,
		'Reply with JSON only: {"verdicts":[{"id":1,"verdict":"wrong|better|needed","why":"one short English sentence"}]}',
	].join("\n");
	const r = await chatJson([{ role: "user", content: user }], VerdictSchema, { ai, sample, effort: "low", tag: "e10/judge" });
	const of = new Map(r.value.verdicts.map((v) => [items[v.id - 1]?.i, v]));
	return {
		spots: spots
			.filter((_, i) => of.get(i)?.verdict !== "wrong")
			.map((s) => (of.get(spots.indexOf(s))?.verdict === "better" ? { ...s, tier: "better" as const } : s)),
		wrong: items.filter((x) => of.get(x.i)?.verdict === "wrong").map((x) => ({ words: x.words, why: of.get(x.i)!.why, heard: heardOf.get(x.i) })),
		all: items.map((x) => ({ words: x.words, verdict: of.get(x.i)?.verdict ?? "?", why: of.get(x.i)?.why ?? "", heard: heardOf.get(x.i) })),
		calls: [...(heard?.calls ?? []), ...r.calls],
	};
}
