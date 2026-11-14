import { norm } from "./check";

/** Which of the phrases worked out in a piece come back in a new text (code only: normalised, case- and quote-blind). */
export function reused(text: string, phrases: string[]): boolean[] {
	const t = ` ${norm(text)} `;
	return phrases.map((p) => t.includes(` ${norm(p)} `));
}
/** The new text cut into runs, those inside a reused phrase marked, for display. */
export function markReused(text: string, phrases: string[]): { text: string; hit: boolean }[] {
	const lower = text.toLowerCase().replace(/[’‘]/g, "'");
	const hits: [number, number][] = [];
	for (const p of phrases) {
		const q = p
			.toLowerCase()
			.replace(/[’‘]/g, "'")
			.replace(/[.!?]+$/, "");
		if (!q) continue;
		const at = lower.indexOf(q);
		if (at >= 0) hits.push([at, at + q.length]);
	}
	hits.sort((a, b) => a[0] - b[0]);
	const out: { text: string; hit: boolean }[] = [];
	let pos = 0;
	for (const [a, b] of hits) {
		if (a < pos) continue;
		if (a > pos) out.push({ text: text.slice(pos, a), hit: false });
		out.push({ text: text.slice(a, b), hit: true });
		pos = b;
	}
	if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
	return out;
}
