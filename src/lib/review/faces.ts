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

/** A sentence split around the words that matter in it, for marking or blanking them; null when they are not in it. */
export function around(text: string, part: string) {
	const at = part ? text.toLowerCase().indexOf(part.toLowerCase()) : -1;
	return at < 0 ? null : { before: text.slice(0, at), part: text.slice(at, at + part.length), after: text.slice(at + part.length) };
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
	examples?: { t: string; n?: string; span?: string }[];
}): Face[] {
	const key = fixedPart(n.phrase);
	const out: Face[] = [];
	const own = n.final ? around(n.final, key) : null;
	if (own && n.final) out.push({ text: n.final, answer: own.part, was: n.before, cue: n.before ? undefined : n.gloss });
	for (const e of n.examples ?? []) out.push(...exampleFace(e, key, n.gloss));
	return out;
}

/** An example's card: the words it marks as the phrase (`span`), else the phrase's fixed words; none when neither is in it. */
function exampleFace(e: { t: string; n?: string; span?: string }, key: string, gloss?: string): Face[] {
	const at = (e.span && around(e.t, e.span)) || around(e.t, key);
	return at ? [{ text: e.t, answer: at.part, cue: e.n || gloss }] : [];
}

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
	examples?: { t: string; n?: string; span?: string }[];
}): Face[] {
	let out: Face[];
	if (n.kind === "own") out = facesOf(n);
	else {
		const read = n.sentence && n.marked ? around(n.sentence, n.marked) : null;
		out = read && n.sentence ? [{ text: n.sentence, answer: read.part, cue: n.gloss }] : [];
		for (const e of n.examples ?? []) out.push(...exampleFace(e, fixedPart(n.phrase), n.gloss));
	}
	return out.length ? out : [{ text: n.phrase, answer: n.phrase, cue: n.gloss }];
}
