/* Checking a typed review answer. By code, never by a model: spelling slips, case, spacing and curly quotes do not count
   against the learner. */
import type { Verdict } from "#lib/constants.ts";

export type { Verdict };
export const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[’‘]/g, "'")
		.replace(/[^\p{L}\p{N}' ]/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
function distance(a: string, b: string) {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
	return d[a.length][b.length];
}
/** `own` cards may be said another way just as well: only the learner can tell, so another answer is "other", not wrong. */
export function verdictOf(card: { kind: "own" | "collected"; answer: string; also?: string[] }, given: string): Verdict {
	if (!given.trim()) return "none";
	const g = norm(given);
	const all = [card.answer, ...(card.also ?? [])].map(norm);
	if (all.includes(g)) return "exact";
	const best = Math.min(...all.map((a) => distance(a, g) / Math.max(a.length, 1)));
	if (best <= 0.2) return "close";
	return card.kind === "own" ? "other" : "miss";
}
/** The rating the result suggests (none for "other": the learner judges it). */
export const SUGGEST: Record<Verdict, string | null> = { exact: "good", close: "hard", other: null, miss: "again", none: "again" };
/** The first letter of each word, the rest dotted: a hint that keeps the length. */
export const hintOf = (answer: string) =>
	answer
		.split(/(\s+)/)
		.map((w) => (/\s/.test(w) ? w : w[0] + w.slice(1).replace(/\p{L}/gu, "·")))
		.join("");
