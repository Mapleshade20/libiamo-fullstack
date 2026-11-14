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
	/** Other answers that count as the same. */
	also?: string[];
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
export function facesOf(n: { phrase: string; gloss?: string; before?: string; final?: string; examples?: { t: string; n?: string }[] }): Face[] {
	const key = fixedPart(n.phrase);
	const out: Face[] = [];
	const own = n.final ? around(n.final, key) : null;
	if (own && n.final) out.push({ text: n.final, answer: own.part, was: n.before, cue: n.before ? undefined : n.gloss });
	for (const e of n.examples ?? []) {
		const at = around(e.t, key);
		if (at) out.push({ text: e.t, answer: at.part, cue: e.n || n.gloss });
	}
	return out;
}
