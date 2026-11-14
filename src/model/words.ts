/**
 * The words of a text with where they are, in any script. Chinese and Japanese put no spaces between words, so words
 * come from the platform's segmenter (dictionary-based for those scripts), never from spaces or a letter class.
 */
const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export type Word = { w: string; from: number; to: number };

/** Lowercased, with typographic apostrophes as straight ones, so comparisons ignore both. */
export function words(text: string, base = 0): Word[] {
	const out: Word[] = [];
	for (const s of segmenter.segment(text))
		if (s.isWordLike) out.push({ w: s.segment.toLowerCase().replace(/’/g, "'"), from: base + s.index, to: base + s.index + s.segment.length });
	return out;
}
