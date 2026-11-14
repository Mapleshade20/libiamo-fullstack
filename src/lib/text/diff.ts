import { diffArrays } from "diff";

import { words } from "#lib/text/words.ts";

export const OPEN = "⟦";
export const CLOSE = "⟧";

type Tok = { s: string; at: number };

/** Quotes and apostrophes compare by kind, not glyph: a rewrite that only straightens ’ is no change. */
const sameQuotes = (x: string) => x.replace(/[’‘ʼ]/g, "'").replace(/[“”„]/g, '"');

/** Words are found on the text with its quotes normalised (’ and ' split words differently), but keep their own glyphs. */
function tokens(text: string, lang: string): Tok[] {
	const seg = new Intl.Segmenter(lang, { granularity: "word" });
	return Array.from(seg.segment(sameQuotes(text)), (x) => ({ s: text.slice(x.index, x.index + x.segment.length), at: x.index }));
}

/** A change pass 1 made, as a range of the original. A pure insertion has from === to. */
export type Hunk = { id: number; from: number; to: number; before: string; after: string };
/** A span the model left untouched for pass 2. */
export type Open = { id: number; from: number; to: number; text: string };

type Op = { kind: "eq" | "del" | "ins"; s: string; orig?: Tok; open: boolean };

/**
 * Align the original with a rewrite that may wrap spans in ⟦…⟧. Changes separated only by whitespace merge into one hunk;
 * changes inside ⟦…⟧ are dropped, since that span belongs to pass 2 as a whole.
 */
export function align(original: string, rewrite: string, lang: string): { hunks: Hunk[]; opens: Open[]; plain: string } {
	const a = tokens(original, lang);
	const b = tokens(rewrite, lang);
	const ops: Op[] = [];
	let i = 0;
	let depth = 0;
	for (const part of diffArrays(
		a.map((t) => t.s),
		b.map((t) => t.s),
		{ comparator: (x, y) => sameQuotes(x) === sameQuotes(y) },
	)) {
		for (const s of part.value) {
			if (part.added) {
				if (s === OPEN) depth += 1;
				else if (s === CLOSE) depth = Math.max(0, depth - 1);
				else ops.push({ kind: "ins", s, open: depth > 0 });
			} else {
				ops.push({ kind: part.removed ? "del" : "eq", s, orig: a[i++], open: depth > 0 });
			}
		}
	}

	const opens: Open[] = [];
	for (let k = 0; k < ops.length; ) {
		if (!ops[k].open || !ops[k].orig) {
			k++;
			continue;
		}
		let end = k;
		for (let m = k; m < ops.length && ops[m].open; m++) if (ops[m].orig) end = m;
		const from = ops[k].orig!.at;
		const to = ops[end].orig!.at + ops[end].orig!.s.length;
		opens.push({ id: opens.length + 1, from, to, text: original.slice(from, to).trim() });
		k = end + 1;
		while (k < ops.length && ops[k].open) k++;
	}

	const hunks: Hunk[] = [];
	const blank = (op: Op) => op.kind === "eq" && !op.s.trim();
	for (let k = 0; k < ops.length; ) {
		if (ops[k].kind === "eq" || ops[k].open) {
			k++;
			continue;
		}
		let end = k;
		for (let m = k + 1; m < ops.length && !ops[m].open; m++) {
			if (ops[m].kind !== "eq") end = m;
			else if (!blank(ops[m])) break;
		}
		// Grow to whole words ("on/" → "on/in") and drop edge whitespace.
		const space = (op: Op) => !op.s.trim();
		// A deleted space at an edge is part of the change when it would otherwise glue nothing: "(no alcohol version)"
		// → "(alcohol-free)" deletes the spaces after "(no" and before "version", and trimming them leaves "( alcohol -free)".
		const word = (op: Op | undefined) => !!op && op.kind === "eq" && !space(op) && !op.open;
		let start = k;
		while (start < end && space(ops[start]) && !(ops[start].kind === "del" && word(ops[start - 1]))) start++;
		let last = end;
		while (last > start && space(ops[last]) && !(ops[last].kind === "del" && word(ops[last + 1]))) last--;
		const raw = ops
			.slice(start, last + 1)
			.filter((o) => o.kind !== "del")
			.map((o) => o.s)
			.join("");
		// A deleted edge space belongs to the change only when the replacement does not bring a space there itself:
		// "rewrite[ ]many[ ]years" → "rewrites years" kept the first space and deleted the second, and taking that one
		// in made "rewrite many " → "rewrites", which glued onto the next change ("rewritesyears of lore").
		const keepLead = space(ops[start]) && ops[start].kind === "del" && !/^\s/.test(raw);
		const keepTail = space(ops[last]) && ops[last].kind === "del" && !/\s$/.test(raw);
		const glued = (op: Op | undefined) => op && op.kind === "eq" && !space(op) && !op.open;
		while (!space(ops[start]) && glued(ops[start - 1])) start--;
		while (!space(ops[last]) && glued(ops[last + 1])) last++;
		if (ops.slice(start, last + 1).every((o) => o.kind === "eq")) {
			k = end + 1;
			continue;
		}
		const run = ops.slice(start, last + 1);
		const origToks = run.filter((o) => o.orig).map((o) => o.orig!);
		const anchor = origToks[0] ??
			ops
				.slice(0, start)
				.reverse()
				.find((o) => o.orig)?.orig ?? { at: 0, s: "" };
		let from = origToks.length ? origToks[0].at : anchor.at + anchor.s.length;
		let to = origToks.length ? origToks.at(-1)!.at + origToks.at(-1)!.s.length : from;
		if (!keepLead) while (from < to && /\s/.test(original[from])) from++;
		if (!keepTail) while (to > from && /\s/.test(original[to - 1])) to--;
		hunks.push({
			id: hunks.length + 1,
			from,
			to,
			before: original.slice(from, to),
			after: run
				.filter((o) => o.kind !== "del")
				.map((o) => o.s)
				.join("")
				.trim(),
		});
		k = end + 1;
	}
	// Changes at most one word apart, one of them adding or dropping words, are one change: "Is it possible" → "Would it be possible" came out as "Is → Would"
	// (optional) and "∅ → be" (needed), and a writer shown only what is needed got "Is it be possible" (2026-11-10);
	// "When it can be fixed" → "When can it be fixed" was three cards that only work together.
	for (let i = hunks.length - 1; i > 0; i--) {
		const a = hunks[i - 1];
		const b = hunks[i];
		const mid = original.slice(a.to, b.from);
		if (b.from <= a.to || /[.!?…。！？\n]/.test(mid) || words(mid).length > 1) continue;
		// Only when one of them adds or drops words (a moved or added word); two swapped words stay two cards.
		if (![a.before.trim(), a.after, b.before.trim(), b.after].some((x) => x === "")) continue;
		if (opens.some((o) => a.from < o.to && b.to > o.from)) continue;
		const to = b.to > b.from ? b.to : a.to + mid.trimEnd().length;
		const after = `${a.after}${mid}${b.after}`.replace(/\s+/g, " ").trim();
		hunks.splice(i - 1, 2, { id: a.id, from: a.from, to, before: original.slice(a.from, to), after });
	}
	// Two changes on overlapping text contradict each other (applying both would lose words): the original stays.
	// Changes inside a pass-2 span, and changes that only swap quote glyphs, are no changes.
	// Changes that touch are one change ("Brokentail’s" → "" then "" → "'s" is "Brokentail’s" → "'s").
	for (let i = hunks.length - 1; i > 0; i--) {
		const a = hunks[i - 1];
		const b = hunks[i];
		if (b.from !== a.to) continue;
		hunks.splice(i - 1, 2, { id: a.id, from: a.from, to: b.to, before: original.slice(a.from, b.to), after: `${a.after}${b.after}` });
	}
	const kept = hunks.filter((h, i) => {
		if (sameQuotes(h.before) === sameQuotes(h.after)) return false;
		if (opens.some((o) => h.from < o.to && h.to > o.from)) return false;
		return !hunks.some(
			(o, j) =>
				j !== i &&
				h.from < Math.max(o.to, o.from + 1) &&
				Math.max(h.to, h.from + 1) > o.from &&
				!(o.from === o.to && h.from === h.to && o.from !== h.from),
		);
	});
	// The writer's apostrophes stay theirs in what pass 1 writes.
	const curly = (original.match(/’/g)?.length ?? 0) > (original.match(/'/g)?.length ?? 0);
	kept.forEach((h, i) => {
		h.id = i + 1;
		if (curly) h.after = h.after.replace(/(\p{L})'(\p{L})/gu, "$1’$2");
	});
	return { hunks: kept, opens, plain: rewrite.replaceAll(OPEN, "").replaceAll(CLOSE, "") };
}

/** The original with each hunk shown as [before → after] and each open span as ⟦…⟧, for prompts and reports. */
export function markup(original: string, hunks: Hunk[], opens: Open[]): string {
	const marks = [
		...hunks.map((h) => ({ at: h.from, end: h.to, put: `[#${h.id} ${h.before || "∅"} → ${h.after.trim() || "∅"}]` })),
		...opens.map((o) => ({ at: o.from, end: o.to, put: `⟦#${o.id} ${original.slice(o.from, o.to)}⟧` })),
	].sort((x, y) => x.at - y.at);
	let out = "";
	let pos = 0;
	for (const m of marks) {
		if (m.at < pos) continue;
		out += original.slice(pos, m.at) + m.put;
		pos = m.end;
	}
	return out + original.slice(pos);
}
