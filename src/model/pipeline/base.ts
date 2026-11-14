import { z } from "zod";
import { align, type Hunk } from "../diff.ts";
import { applyEdits } from "../edits.ts";
import { type Draft, fbName, LANG_NAMES } from "../fixtures/types.ts";
import { type CallResult, chatJson, type ModelKey } from "../llm.ts";
import { type Analysis, leftLine, numbered, type Sentence, sentences, spotRange } from "../pass2/analyze.ts";

/**
 * What the learner sees in pass 2: the draft with every pass-1 change made. `map` takes a draft position there, `inv`
 * back; `left` are the spans pass 1 could not fix without the writer, which pass 2 must cover.
 */
export type Base = {
	text: string;
	map: (p: number, side: "from" | "to") => number;
	inv: (p: number, side: "from" | "to") => number;
	left: string[];
	hunks: Hunk[];
};

export function analysisBase(d: Draft, rewrite: string): Base {
	const { hunks, opens } = align(d.text, rewrite, d.target);
	const r = applyEdits(
		d.text,
		hunks.map((h) => ({ from: h.from, to: h.to, after: h.after })),
	);
	return { text: r.text, map: r.map, inv: r.inv, left: opens.map((o) => o.text), hunks };
}

export { leftLine };

const RebaseSchema = z.object({
	spots: z.array(z.object({ id: z.number(), keep: z.boolean(), quote: z.string().nullable().optional(), problem: z.string().nullable().optional() })),
});

/**
 * Pass 2's analysis is made on the draft as written, beside pass 1 (2026-11-07, E5 on the five real drafts: read on
 * the pass-1 text instead it found 5 of 14 gold spots against 11, since pass 1 smooths over what pass 2 should
 * teach). But the learner reads the pass-1 text, so each spot is then rebased on it: dropped when pass 1's changes
 * already did what its problem asks, otherwise quoted and described as the text now reads, never mentioning errors
 * pass 1 fixed. Sentence numbers are moved to the pass-1 text's. Spots and the map come back on `base.text`.
 */
export async function rebase(
	d: Draft,
	base: Base,
	a: Analysis,
	model: ModelKey,
): Promise<{ analysis: Analysis; calls: CallResult[]; dropped: string[] }> {
	const ds = sentences(d.text, d.target);
	const bs = sentences(base.text, d.target);
	const ids = (xs: number[]) => {
		const out = new Set<number>();
		for (const x of ds.filter((s) => xs.includes(s.id))) {
			const from = base.map(x.from, "from");
			const to = base.map(x.to, "to");
			for (const b of bs) if (b.from < to && b.to > from) out.add(b.id);
		}
		return [...out].sort((p, q) => p - q);
	};
	const map = a.map.map((r) => ({ ...r, sentences: ids(r.sentences) }));
	const placed = a.spots.map((s, i) => {
		const [from, to] = spotRange(d.text, ds, s);
		// The changes inside the spot's own stretch (an insertion at its edge counts): only those can have done its job.
		const changes = base.hunks.filter((h) => from >= 0 && h.from <= to && h.to >= from);
		return { i, s, from, to, changes };
	});
	// Only spots with a pass-1 change in or near them can have gone stale; the others only move.
	const touched = placed.filter((p) => p.changes.length);
	const moved = (p: (typeof placed)[number], quote?: string | null, problem?: string | null) => {
		const q = quote && base.text.includes(quote) ? quote : p.s.quote && base.text.includes(p.s.quote) ? p.s.quote : null;
		return { ...p.s, quote: q, problem: problem?.trim() || p.s.problem, sentences: ids(p.s.sentences), ...(q ? {} : { scope: "sentence" as const }) };
	};
	if (!touched.length) return { analysis: { ...a, map, spots: placed.map((p) => moved(p)) }, calls: [], dropped: [] };
	const F = fbName(d);
	const user = [
		`A learner's ${LANG_NAMES[d.target]} draft went through a first pass that fixed its small errors. The text as it now reads, sentences numbered:`,
		numbered(bs as Sentence[]),
		"",
		"A tutor found these problems on the draft before the first pass. For each: the words it quoted, the first-pass changes near them (before → after), and the problem as written:",
		...touched.map(
			(p, n) =>
				`${n + 1}. quoted: "${p.s.quote ?? p.s.phrase ?? ""}"\n   changes: ${p.changes.map((h) => `"${h.before || "∅"}" → "${h.after || "∅"}"`).join("; ")}\n   problem: ${p.s.problem}`,
		),
		"",
		`The learner now sees only the text as it reads. For each problem: keep false when the first-pass changes already did what the problem asks, so a reader would no longer stumble there; keep true when it is still a problem in the text as it reads. Small corrections (grammar, spelling, a word swapped) only fix problems about those very words: a problem about what the text says or leaves out (a missing point, evidence, a reason), what a reader takes away, or how a sentence is built stays, keep true. For a kept problem: quote, the words of the text as it reads where a reader stumbles now, copied character for character; problem, the same problem said about the text as it reads, in ${F}, at the same length: keep its reasoning and what a reader expects, but never mention an error the first pass fixed (a missing or wrong word, grammar, spelling) and never quote words that are no longer in the text. When nothing in it needs to change, repeat it as it was.`,
		'Reply with JSON only: {"spots":[{"id":1,"keep":true,"quote":"","problem":""}]}',
	].join("\n");
	const r = await chatJson([{ role: "user", content: user }], RebaseSchema, { model, effort: "low", tag: "pass2/rebase" });
	const by = new Map(r.value.spots.map((x) => [touched[x.id - 1]?.i, x]));
	const dropped: string[] = [];
	const spots = placed.flatMap((p) => {
		const v = by.get(p.i);
		if (!v) return [moved(p)];
		if (!v.keep) {
			dropped.push(p.s.problem);
			return [];
		}
		return [moved(p, v.quote, v.problem)];
	});
	return { analysis: { ...a, map, spots }, calls: r.calls, dropped };
}
