import { sentences } from "./pass2/analyze.ts";
import { type Word, words } from "./words.ts";

/** Apply non-overlapping edits to `text`; returns the new text and a position map from old to new offsets. */
export function applyEdits(text: string, edits: { from: number; to: number; after: string }[]) {
	const sorted = [...edits].sort((a, b) => a.from - b.from);
	let out = "";
	let pos = 0;
	const marks: { from: number; to: number; nf: number; nt: number }[] = [];
	for (const e of sorted) {
		if (e.from < pos) continue;
		out += text.slice(pos, e.from);
		const nf = out.length;
		// A pure insertion between two words needs its own spaces (hunks are trimmed).
		const pad = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
		// Any edit that would glue two words together gets a space ("matters" + "hugely.").
		const lead = e.after && pad(out.at(-1)) && pad(e.after[0]) ? " " : "";
		const tail = e.after && pad(text[e.to]) && pad(e.after.at(-1)) ? " " : "";
		out += e.from === e.to ? `${pad(out.at(-1)) ? " " : ""}${e.after}${pad(text[e.to]) ? " " : ""}` : `${lead}${e.after}${tail}`;
		// A deletion between two spaces would leave a double space, so it takes the space after it too; the map must
		// count that space, or every position after it is off by one.
		pos = e.after === "" && out.endsWith(" ") && text[e.to] === " " ? e.to + 1 : e.to;
		marks.push({ from: e.from, to: pos, nf, nt: out.length });
	}
	out += text.slice(pos);
	const map = (p: number, side: "from" | "to") => {
		let delta = 0;
		for (const m of marks) {
			if (p >= m.to) delta = m.nt - m.to;
			else if (p > m.from || (p === m.from && side === "to")) return side === "from" ? m.nf : m.nt;
			else break;
		}
		return p + delta;
	};
	/** The other way: a position in the edited text back to the original (inside an edit, to its edge). */
	const inv = (p: number, side: "from" | "to") => {
		let delta = 0;
		for (const m of marks) {
			if (p >= m.nt && !(p === m.nt && m.nf === m.nt && side === "from")) delta = m.to - m.nt;
			else if (p > m.nf || (p === m.nf && side === "to" && m.nt > m.nf)) return side === "from" ? m.from : m.to;
			else break;
		}
		return p + delta;
	};
	return { text: out, map, inv };
}

type W = Word;
const wordsAt = (x: string, base = 0): W[] => words(x, base);

/**
 * The text an attempt replaces. Learners often rewrite a little more than the highlighted spot: the spot grows over the
 * words before it that the attempt starts with and the words after it that the attempt ends with (within the sentence),
 * and to the whole sentence when they wrote a full sentence for a spot covering most of it.
 */
export function scopeOf(text: string, target: string, attempt: string): string {
	const at = text.indexOf(target);
	if (at < 0) return target;
	const end = at + target.length;
	// The sentences the spot starts and ends in (a spot that ends on its own "?" ends that sentence).
	const ss = sentences(text, "en");
	const start = ss.find((x) => x.from <= at && at < x.to)?.from ?? at;
	const stop = ss.find((x) => x.from < end && end <= x.to)?.to ?? end;
	const a = wordsAt(attempt).map((x) => x.w);
	// A spot that is a whole sentence may be rewritten together with its neighbour in the same paragraph.
	const si = ss.findIndex((x) => x.from === start);
	const ei = ss.findIndex((x) => x.to === stop);
	const leadFrom = at === start && si > 0 && ss[si - 1].para === ss[si].para ? ss[si - 1].from : start;
	const tailTo = end === stop && ei >= 0 && ss[ei + 1]?.para === ss[ei].para ? ss[ei + 1].to : stop;
	const lead = wordsAt(text.slice(leadFrom, at), leadFrom);
	const tail = wordsAt(text.slice(end, tailTo), end);
	let from = at;
	let to = end;
	// The longest run of words before the spot that the attempt begins with (it may begin mid-way through that run).
	for (let k = Math.min(lead.length, a.length); k >= 1; k--) {
		const run = lead.slice(-k).map((x) => x.w);
		// A single word only counts when the attempt starts with it, right before the spot.
		const i = k === 1 ? (a[0] === run[0] ? 0 : -1) : a.indexOf(run[0]);
		if (i >= 0 && i <= 2 && run.every((w, n) => a[i + n] === w)) {
			from = lead[lead.length - k].from;
			break;
		}
		// Or it begins with the start of that run: a rewrite from the beginning of the sentence before. One shared word is
		// not enough ("Me sería…" after "¿Me puede decir…?" swallowed the question, 2026-11-10).
		if (
			(k >= 3 || (k >= 2 && k === lead.length)) &&
			a.slice(0, k).join(" ") ===
				lead
					.slice(0, k)
					.map((x) => x.w)
					.join(" ")
		) {
			from = lead[0].from;
			break;
		}
	}
	// The longest run of words just after the spot (starting within its first three words) that the attempt ends with.
	tailRun: for (let k = Math.min(tail.length, a.length); k >= 1; k--) {
		for (let j = 0; j <= (k === 1 ? 0 : Math.min(2, tail.length - k)); j++) {
			if (
				a.slice(-k).join(" ") ===
				tail
					.slice(j, j + k)
					.map((x) => x.w)
					.join(" ")
			) {
				to = tail[j + k - 1].to;
				break tailRun;
			}
		}
		if (
			k >= 2 &&
			a.slice(-k).join(" ") ===
				tail
					.slice(-k)
					.map((x) => x.w)
					.join(" ")
		) {
			to = tailTo;
			break;
		}
	}
	// The attempt carries the words that end the rest of the sentence (it may add to them): it rewrote up to there.
	const ending = tail.filter((x) => x.to <= stop).map((x) => x.w);
	if (to < stop && ending.length >= 3 && a.join(" ").includes(ending.slice(-3).join(" "))) to = stop;
	// A full sentence starts like one (a capital, or any start in a script without case); its end mark may be missing
	// (punctuation never decides).
	const sentenceWords = wordsAt(text.slice(start, stop)).length;
	const opens = /^[\p{Lu}“"(¿¡「『（]/u.test(attempt.trim()) || /^[^\p{Lu}\p{Ll}\s\p{P}]/u.test(attempt.trim());
	const full = opens && (/[.!?)”"。！？」]$/.test(attempt.trim()) || a.length >= 0.6 * sentenceWords);
	if (full && (end - at) / Math.max(1, stop - start) > 0.6) [from, to] = [Math.min(from, start), Math.max(to, stop)];
	// A full sentence that replaces up to the sentence's end takes the end punctuation with it.
	if (full && to < stop && /^[.!?]$/.test(text.slice(to, stop).trim())) to = stop;
	// An opening bracket the attempt does not start with stays in the post (its closing half is outside the spot).
	let out = text.slice(from, to).trim();
	if (/^[(（]/.test(out) && !/^[(（]/.test(attempt.trim()) && !/[)）]/.test(out)) out = out.slice(1).trimStart();
	return out;
}
