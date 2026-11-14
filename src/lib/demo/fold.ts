/** What folding needs to know of a piece in My writing. */
type Piece = { id: string; lang?: string; scenarioId?: string; at?: number; result?: unknown; handoff?: { text: string } };

/**
 * Copies of one piece folded into one: the same text in the same language (and scenario) is one piece. A finished copy
 * wins over unfinished ones, then the newest. The stand-ins and pieces without a handoff are never copies.
 */
export function foldCopies<W extends Piece>(all: W[], standIds: Set<string>): W[] {
	const keyOf = (w: W) => (standIds.has(w.id) || !w.handoff ? `id:${w.id}` : `${w.lang}|${w.scenarioId ?? ""}|${w.handoff.text.trim()}`);
	const best = new Map<string, W>();
	for (const w of all) {
		const k = keyOf(w);
		const had = best.get(k);
		if (!had || (!!w.result && !had.result) || (!!w.result === !!had.result && (w.at ?? 0) > (had.at ?? 0))) best.set(k, w);
	}
	const keep = new Set(best.values());
	return all.filter((w) => keep.has(w));
}
