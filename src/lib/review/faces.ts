import type { Example } from "#lib/notebook/types.ts";

/*
 * What review asks, decided once for review and the notebook (2026-11-08). Every card is the same shape: a sentence
 * with the phrase blanked, and above it one cue to recall it by. From the learner's own writing, the cue is what they
 * first wrote there (struck): they say the part again as they settled it. From reading, or from an entry's examples,
 * the cue is what it means (or the example's translation). The notebook shows the card review will ask next with the
 * same component, so the two never drift apart.
 */
export type Face = {
	/** The sentence, with `answer` in it. */
	text: string;
	answer: string;
	/** Where `answer` begins in `text` (the same words may be there twice). */
	at?: number;
	/** Words inside the answer that are not the phrase (the slot in "framed … as"): shown, though written with the rest. */
	given?: string[];
	/** What the learner first wrote there, shown struck: the cue for a card from their own writing. */
	was?: string;
	/** What it means, or the sentence's translation: the cue for the rest. */
	cue?: string;
};

/** The fixed words of a phrase with an open slot, which a sentence must contain ("topped with …" → "topped with"). */
export const fixedPart = (phrase: string) =>
	phrase
		.split(/…|\.\.\./)
		.map((x) => x.trim().replace(/^[,;]\s*|[,;]$/g, ""))
		.sort((a, b) => b.length - a.length)[0] ?? "";

/** A word's letters or digits, in a script written with spaces (where a piece of a span may not begin or end mid-word). */
const spaced = (c = "") =>
	/[\p{L}\p{N}]/u.test(c) && !/[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}]/u.test(c);

/**
 * Where each piece of a span ("framed … as") is in a sentence, in order and whatever the case; null when one is not.
 * `at`, where each piece was marked, picks those of the same words written more than once; a piece without it, or no
 * longer there, is looked for as whole words ("over" is not the end of "leftover"), and failing that anywhere. Found
 * in the sentence as written (never a lowercased copy, whose letters can be more: "İ").
 */
export function spanRanges(text: string, span: string, at: readonly number[] = []): [number, number][] | null {
	const pieces = span.split(/\s*…\s*/).filter(Boolean);
	const whole = (i: number, n: number) => !(spaced(text[i - 1]) && spaced(text[i])) && !(spaced(text[i + n - 1]) && spaced(text[i + n]));
	const find = (words: boolean) => {
		const out: [number, number][] = [];
		for (const [k, piece] of pieces.entries()) {
			const from = out.at(-1)?.[1] ?? 0;
			const marked = at[k];
			// Where it was marked is taken as it is.
			if (marked !== undefined && marked >= from && text.slice(marked, marked + piece.length).toLowerCase() === piece.toLowerCase()) {
				out.push([marked, marked + piece.length]);
				continue;
			}
			const re = new RegExp(piece.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
			re.lastIndex = from;
			let m = re.exec(text);
			while (m && words && !whole(m.index, m[0].length)) {
				re.lastIndex = m.index + 1;
				m = re.exec(text);
			}
			if (!m) return null;
			out.push([m.index, m.index + m[0].length]);
		}
		return out.length ? out : null;
	};
	return find(true) ?? find(false);
}

/**
 * A sentence split around the words that matter in it, for marking or blanking them; null when they are not in it. A
 * span in pieces ("framed … as") is the stretch from the first to the last, with the words between them `given`.
 */
export function around(text: string, part: string, at?: readonly number[]) {
	const r = spanRanges(text, part, at);
	if (!r) return null;
	const [from, to] = [r[0][0], r[r.length - 1][1]];
	const given = r.slice(1).map(([at], i) => text.slice(r[i][1], at).trim());
	return { before: text.slice(0, from), part: text.slice(from, to), after: text.slice(to), given };
}

/** What a card asks of a sentence found `around` its span: the stretch, and the words in it the learner is given. */
const asked = (at: { before: string; part: string; given: string[] }) => ({
	answer: at.part,
	at: at.before.length,
	...(at.given.length ? { given: at.given } : {}),
});

/**
 * A sentence a model marked with <m>…</m>: the plain sentence, its marked words as a span (pieces apart joined by "…"),
 * and where each piece begins (`at`, so the same words elsewhere in the sentence are not taken for them).
 */
export function unmark(tagged: string): { text: string; span?: string; at?: number[] } {
	const pieces: string[] = [];
	const at: number[] = [];
	let last = 0;
	let plain = 0;
	for (const m of tagged.matchAll(/<m>(.*?)<\/m>/g)) {
		const between = tagged.slice(last, m.index).replace(/<\/?m>/g, "");
		plain += between.length;
		// Marked words with only a space between them are one piece.
		if (pieces.length && !between.trim()) pieces[pieces.length - 1] += between + m[1];
		else if (m[1].trim()) {
			pieces.push(m[1]);
			at.push(plain + m[1].length - m[1].trimStart().length);
		}
		plain += m[1].length;
		last = m.index + m[0].length;
	}
	return { text: tagged.replace(/<\/?m>/g, ""), ...(pieces.length ? { span: pieces.map((p) => p.trim()).join(" … "), at } : {}) };
}

/**
 * The cards an entry from the learner's own writing gets, in the order review asks them: first their own sentence
 * (cued by what they first wrote), then each example (cued by its translation), so later reviews move the phrase into
 * other situations. Empty when the phrase cannot be found in any of them.
 */
export function facesOf(n: {
	phrase: string;
	gloss?: string;
	before?: string;
	final?: string;
	/** The words of `final` that are the phrase as used there (the notes call marks them), and where they begin. */
	marked?: string;
	markedAt?: number[];
	examples?: Example[];
}): Face[] {
	const key = fixedPart(n.phrase);
	const out: Face[] = [];
	const own = n.final ? around(n.final, n.marked || key, n.marked ? n.markedAt : undefined) : null;
	if (own && n.final) out.push({ text: n.final, ...asked(own), was: n.before, cue: n.before ? undefined : n.gloss });
	for (const e of n.examples ?? []) out.push(...exampleFace(e, key, n.gloss));
	return out;
}

/** An example's card: the words it marks as the phrase (`span`), else the phrase's fixed words; none when neither is in it. */
function exampleFace(e: Example, key: string, gloss?: string): Face[] {
	const at = (e.span && around(e.t, e.span, e.at)) || around(e.t, key);
	return at ? [{ text: e.t, ...asked(at), cue: e.n || gloss }] : [];
}

/** The face a card shows after `reps` reviews: each in turn, so later reviews move on. */
export const faceAt = (faces: Face[], reps = 0) => faces[reps % faces.length];

/**
 * Every card an entry gets, in the order review asks them (a card's review count picks one, so later reviews move on).
 * Own: as `facesOf`. Collected: the sentence it was read in with the highlighted words blanked, cued by what it means,
 * then its examples. An entry whose phrase is in none of them is asked bare: what it means, the phrase to recall.
 */
export function noteFaces(n: {
	kind: "own" | "collected";
	phrase: string;
	gloss?: string;
	before?: string;
	final?: string;
	sentence?: string;
	marked?: string;
	markedAt?: number[];
	examples?: Example[];
}): Face[] {
	let out: Face[];
	if (n.kind === "own") out = facesOf(n);
	else {
		const read = n.sentence && n.marked ? around(n.sentence, n.marked, n.markedAt) : null;
		out = read && n.sentence ? [{ text: n.sentence, ...asked(read), cue: n.gloss }] : [];
		for (const e of n.examples ?? []) out.push(...exampleFace(e, fixedPart(n.phrase), n.gloss));
	}
	return out.length ? out : [{ text: n.phrase, answer: n.phrase, cue: n.gloss }];
}
