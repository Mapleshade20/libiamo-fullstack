/*
 * The translation sheet lines up with its source by blocks: blank-line paragraphs for prose, single lines for a list
 * such as a menu. Blank lines never count as a block, so an extra empty line does not shift the pairing.
 */
export type Block = { from: number; to: number };

/** A text without a blank line is laid out by lines (a menu), any other by paragraphs. */
export const isByLine = (text: string) => !/\n\s*\n/.test(text.trim());

/** The text of each block, and what joins them back into a text laid out the same way. */
export function unitsOf(text: string) {
	const byLine = isByLine(text);
	return { units: blocksOf(text, byLine).map((b) => text.slice(b.from, b.to)), join: byLine ? "\n" : "\n\n" };
}

/** The non-empty blocks of a text, trimmed, with their offsets. */
export function blocksOf(text: string, byLine: boolean): Block[] {
	const out: Block[] = [];
	const sep = byLine ? /\n/g : /\n[^\S\n]*\n\s*/g;
	let at = 0;
	const push = (from: number, to: number) => {
		const raw = text.slice(from, to);
		const lead = raw.length - raw.trimStart().length;
		const body = raw.trim();
		if (body) out.push({ from: from + lead, to: from + lead + body.length });
	};
	for (const m of text.matchAll(sep)) {
		push(at, m.index);
		at = m.index + m[0].length;
	}
	push(at, text.length);
	return out;
}

/** Which block the caret is writing: the one it is in, else the next one (a caret on an empty line starts a block). */
export function blockAt(text: string, caret: number, byLine: boolean): number {
	const bs = blocksOf(text, byLine);
	const i = bs.findIndex((b) => caret <= b.to);
	if (i < 0) return bs.length && caret > bs[bs.length - 1].to && !/\n\s*$/.test(text.slice(bs[bs.length - 1].to, caret)) ? bs.length - 1 : bs.length;
	if (caret >= bs[i].from) return i;
	// Between two blocks: still on the line where the previous block ends, or on a fresh line before this one.
	const gap = text.slice(i > 0 ? bs[i - 1].to : 0, caret);
	return i > 0 && !gap.includes("\n") ? i - 1 : i;
}

type Term = { term: string; shown: string; gloss: string };
/** A source block as runs of plain text and given terms (as the source shows them; longest first, no overlaps). */
export function termRuns(text: string, terms: Term[]): { text: string; term?: Term }[] {
	const byLen = [...terms].filter((t) => t.shown).sort((a, b) => b.shown.length - a.shown.length);
	const out: { text: string; term?: Term }[] = [];
	let plain = "";
	for (let i = 0; i < text.length; ) {
		const t = byLen.find((x) => text.startsWith(x.shown, i) && wordEdge(text, i, i + x.shown.length));
		if (t) {
			if (plain) out.push({ text: plain });
			plain = "";
			out.push({ text: t.shown, term: t });
			i += t.shown.length;
		} else plain += text[i++];
	}
	if (plain) out.push({ text: plain });
	return out;
}
// Latin terms match whole words only ("Leaf" not inside "Leafpool"); CJK has no word edges to check.
const latin = /[\p{Script=Latin}\d]/u;
function wordEdge(text: string, from: number, to: number) {
	const before = text[from - 1];
	const after = text[to];
	const first = text[from];
	const last = text[to - 1];
	return !(before && latin.test(before) && latin.test(first)) && !(after && latin.test(after) && latin.test(last));
}
