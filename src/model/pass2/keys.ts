// Which words of the reference to mark, decided in code. The model used to bracket "two to four single words that carry
// the key choices" on its own (2026-11-06): it marked words the writer already had ("somehow", kept on purpose), marked
// "regret" for a fix that was "regret of" → "regret for", and left most explained choices unmarked, because nothing tied
// its brackets to the explanation rows or to what actually changed. Now a mark is exactly what an explanation row is
// about and the writer did not already write: the row's words in the reference, minus the words kept from the writer's
// version (a word diff), plus a new word right next to them that the row's note talks about (labels often stop one word
// short: "even a little regret" for a note about "regret for"). A row about a big rewrite keeps only the model's marks
// inside it. The skeleton hint blanks the same words.

export type KeyRow = { label: string; note: string; free?: boolean };

const SEG = new Intl.Segmenter(undefined, { granularity: "word" });
type Tok = { w: string; at: number; end: number };
const norm = (w: string) => w.toLowerCase().replace(/[’‘]/g, "'");
function words(s: string): Tok[] {
	return [...SEG.segment(s)].filter((x) => x.isWordLike).map((x) => ({ w: norm(x.segment), at: x.index, end: x.index + x.segment.length }));
}

/** Indices of `b` that are not in a longest common subsequence with `a` (the words the reference brings in). */
function added(a: string[], b: string[]): Set<number> {
	const L = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
	const out = new Set<number>(b.keys());
	for (let i = 0, j = 0; i < a.length && j < b.length; ) {
		if (a[i] === b[j]) {
			out.delete(j);
			i++;
			j++;
		} else if (L[i + 1][j] >= L[i][j + 1]) i++;
		else j++;
	}
	return out;
}

/** Where a row's label stands in the reference, as word indices; a label may skip a quote with "…". Null if absent. */
function locate(label: string, ref: Tok[]): number[] | null {
	const parts = label
		.split(/…|\.\.\./)
		.map((p) => words(p).map((t) => t.w))
		.filter((p) => p.length);
	if (!parts.length) return null;
	const found: number[] = [];
	let from = 0;
	for (const p of parts) {
		let hit = -1;
		for (let i = from; i + p.length <= ref.length && hit < 0; i++) if (p.every((w, k) => ref[i + k].w === w)) hit = i;
		if (hit < 0) return null;
		for (let k = 0; k < p.length; k++) found.push(hit + k);
		from = hit + p.length;
	}
	return found;
}

/** A run of new words longer than this is a rewrite, not a choice to notice: within it, only the model's marks stay. */
const MAX_MARK = 4;

/**
 * The reference with its marks redone in [brackets], and the rows about words the writer already had flagged `free`
 * (shown as a remark, not as a change to learn). When no row can be found in the reference, the model's marks stay.
 */
export function markKeys<R extends KeyRow>(original: string, ref: string, why: R[]): { ref: string; why: (R & { free?: boolean })[] } {
	const bare = ref.replace(/[[\]]/g, "");
	const toks = words(bare);
	const fresh = added(
		words(original).map((t) => t.w),
		toks.map((t) => t.w),
	);
	// The words the model bracketed, as indices into the bare reference's words.
	const modelKeys = new Set<number>();
	let shift = 0;
	for (const m of ref.matchAll(/\[([^\]]+)\]/g)) {
		const a = (m.index ?? 0) - shift;
		const b = a + m[1].length;
		toks.forEach((t, k) => {
			if (t.at >= a && t.end <= b) modelKeys.add(k);
		});
		shift += 2;
	}
	const spans = why.map((r) => locate(r.label, toks));
	if (spans.every((s) => !s)) return { ref, why };
	const owned = new Set(spans.flatMap((s) => s ?? []));
	// Two words side by side, with only a space between (never across punctuation).
	const touching = (k: number, j: number) => j >= 0 && j < toks.length && /^\s*$/.test(bare.slice(toks[Math.min(k, j)].end, toks[Math.max(k, j)].at));
	const groups: number[][] = [];
	const rows = why.map((r, i): R & { free?: boolean } => {
		const span = spans[i];
		if (!span) return r;
		const mine = span.filter((k) => fresh.has(k));
		if (!mine.length) return { ...r, free: true };
		// A new word just outside the label belongs to it when the row's note is about it (the label "even a little
		// regret", the note about "regret for"), unless another row covers it or it is a name.
		const said = new Set(words(r.note).map((t) => t.w));
		for (const [edge, dir] of [
			[Math.min(...span), -1],
			[Math.max(...span), 1],
		]) {
			const k = edge + dir;
			if (fresh.has(k) && !owned.has(k) && touching(edge, k) && said.has(toks[k].w) && !/^\p{Lu}/u.test(bare.slice(toks[k].at))) mine.push(k);
		}
		mine.sort((a, b) => a - b);
		for (let a = 0; a < mine.length; ) {
			let b = a;
			while (b + 1 < mine.length && mine[b + 1] === mine[b] + 1) b++;
			const g = mine.slice(a, b + 1);
			if (g.length <= MAX_MARK) groups.push(g);
			else for (const k of g) if (modelKeys.has(k)) groups.push([k]);
			a = b + 1;
		}
		return r;
	});
	groups.sort((x, y) => x[0] - y[0]);
	let out = "";
	let last = 0;
	for (const g of groups) {
		const a = toks[g[0]].at;
		if (a < last) continue; // Two rows on the same words: the first mark stands.
		const b = toks[g[g.length - 1]].end;
		out += `${bare.slice(last, a)}[${bare.slice(a, b)}]`;
		last = b;
	}
	return { ref: out + bare.slice(last), why: rows };
}
