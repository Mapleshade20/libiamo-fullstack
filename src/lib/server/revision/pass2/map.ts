import { z } from "zod";
import { type Caller, type CallResult, chatJson } from "#lib/server/llm/caller.ts";
import { aLearner, cap, type Draft, fbName, LANG_NAMES, noteLines, pinLang } from "#lib/server/revision/draft.ts";
import { numbered, type Sentence } from "#lib/server/revision/pass2/analyze.ts";

/**
 * C4m: the post's outline for the map, in two levels: its main points, and under each the parts that serve it (an
 * example, a quote, the reason). The analysis used to give a flat list of steps with a label beside each, which read
 * as the same thing said twice and could not show that an example belongs to the point it supports (2026-10-25). Its
 * own call, so the map can change without touching detection. Which parts need fixing is not asked: code marks the
 * nodes the session's stops fall in, so the map and the stops always agree.
 */
/** A part's job for its point, from a fixed set the interface names in each language (`kind…` strings). */
export const KINDS = ["example", "quote", "reason", "explanation", "detail", "comparison", "question", "conclusion", "context"] as const;
const Node = z.object({
	text: z.string(),
	sentences: z.array(z.number()),
	missing: z.boolean().optional(),
	note: z.string().nullable().optional(),
});
const Part = Node.extend({ kind: z.string().transform((k) => ((KINDS as readonly string[]).includes(k) ? k : "detail")) });
// Field order is generation order: the summary is written first, and the points follow its lines.
export const OutlineSchema = z.object({
	summary: z.array(z.string()).optional(),
	points: z.array(Node.extend({ parts: z.array(Part).default([]) })),
});
export type Outline = z.infer<typeof OutlineSchema>;

export async function outline(d: Draft, ss: Sentence[], ai: Caller): Promise<{ value: Outline; calls: CallResult[] }> {
	const F = fbName(d);
	const user = [
		`${cap(aLearner(d))} of ${LANG_NAMES[d.target]} wrote this for ${d.scene.platform} (readers: ${d.scene.audience}). What they want to do: ${d.scene.purpose}.`,
		...noteLines(d),
		"The post, sentence by sentence:",
		"<<<",
		numbered(ss),
		">>>",
		"",
		`First summary: the post as a reader would sum it up to a friend, in two to five short lines (up to seven for a long post), in ${F}, in the post's order. Each line is one thing the writer does (opens, praises one thing, tells what happened, asks one thing, signs off), however many sentences it takes.`,
		"Then points: one per summary line, in the same order, and under each point the sentences that develop it as its parts. Each point with its parts covers one run of consecutive sentences: a sentence goes under the line whose run it falls in, even when it touches another line's topic.",
		"- Every sentence goes in exactly one place. A sentence that states a point belongs to that point; the sentences that develop it (an example, a quote, the reason, a question that follows from it) are its parts. Only a sentence doing two clearly separate jobs (a quote, then a question about it) may be listed under two parts.",
		"- When no single sentence states a point (several sentences that together praise one thing, several related questions), the point is a heading over them: sentences [] and its sentences go to its parts.",
		"- An opening and a sign-off are points of their own (even a single word), never one point together.",
		`- text: in ${F}, plain words, at most about fourteen words. What the writer says or does there ("praises how real his inner voice feels", not "inner voice"). A point with sentences of its own says only what those sentences say, not its summary line, since its parts follow right under it; a point that heads its parts (sentences []) says what they add up to. A part says only what it adds.`,
		`- kind (parts only), one of: ${KINDS.join(", ")} ("detail": anything else that develops the point; "context": background the point needs).`,
		"- missing: true for a part a reader here would clearly need and the post leaves out (a claim with no reason at all, a question with nothing to answer it from), with sentences [] and note: one short sentence on what the reader is left without. Only where it really matters; most posts miss nothing.",
		pinLang(d),
		'Reply with JSON only: {"summary":[""],"points":[{"text":"","sentences":[],"parts":[{"kind":"example","text":"","sentences":[2]}]}]}',
	].join("\n");
	const r = await chatJson([{ role: "user", content: user }], OutlineSchema, { ai, effort: "low", tag: "session/outline" });
	return { ...r, value: inPostOrder(oncePerSentence(r.value)) };
}

/**
 * A sentence listed under a part is that part's, not also its point's (the point then heads its parts). A heading
 * over a single part says the same thing twice: the part's sentences become the point's.
 */
export function oncePerSentence(o: Outline): Outline {
	return {
		...o,
		points: o.points.map((p) => {
			const inParts = new Set(p.parts.flatMap((x) => x.sentences));
			const own = p.sentences.filter((n) => !inParts.has(n));
			if (!own.length && p.parts.length === 1 && !p.parts[0].missing) return { ...p, sentences: p.parts[0].sentences, parts: [] };
			return { ...p, sentences: own };
		}),
	};
}

/** Points and parts in the order the post says them; a missing part keeps its place after the part before it. */
export function inPostOrder(o: Outline): Outline {
	const keyed = <T extends { sentences: number[] }>(xs: T[], first: (x: T) => number) => {
		let last = -1;
		return xs
			.map((x, i) => {
				const k = first(x);
				last = Number.isFinite(k) ? k : last + 0.001;
				return { x, k: last, i };
			})
			.sort((a, b) => a.k - b.k || a.i - b.i)
			.map((e) => e.x);
	};
	const firstOf = (ns: number[]) => (ns.length ? Math.min(...ns) : Number.NaN);
	return {
		...o,
		points: keyed(
			o.points.map((p) => ({ ...p, parts: keyed(p.parts, (x) => firstOf(x.sentences)) })),
			(p) => firstOf([...p.sentences, ...p.parts.flatMap((x) => x.sentences)]),
		),
	};
}
