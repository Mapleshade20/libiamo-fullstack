/*
 * The session's text helpers, shared by the post and the conversation: words as the platform's segmenter finds them,
 * where a learner's sentence goes in the post, and the hint ladder. Everything that returns HTML escapes what it is
 * given, so its output is safe for {@html}.
 */

export const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
/** Key choices come back in [brackets]: without them, and with them marked. */
export const plain = (s: string) => s.replace(/\[([^\]]+)\]/g, "$1");
/** Key words in [brackets] marked; a ⟨placeholder⟩ for what only the writer knows shown as a gap to fill. */
export const rich = (s: string) =>
	esc(s)
		.replace(/\[([^\]]+)\]/g, '<span class="kw">$1</span>')
		.replace(/⟨([^⟩]+)⟩/g, '<span class="ph">$1</span>');
/** Fragments that continue a sentence start with ", "; show them with an ellipsis instead. */
export const bare = (s: string) => s.replace(/^,\s*/, "…");
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Whether new words starting with `t` stand a space apart from the words before them (never in Chinese or Japanese). */
export const wordGap = (t: string | undefined, target?: string) => !["ja", "zh-CN"].includes(target ?? "") && /^[\p{L}\p{N}(“"‘'¿¡]/u.test(t ?? "");

/** Put the learner's sentence into its place in the post. */
export function fitText(kind: string, t: string) {
	t = t.trim().replace(/\s+/g, " ");
	const endP = (s: string) => (/[.!?…~)"”]$/.test(s) ? s : `${s}.`);
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
	switch (kind) {
		case "comma":
			t = t.replace(/[.!?]+$/, "");
			if (/^[A-Z]/.test(t) && !/^(Which|Leaving|And)\b/.test(t)) return `. ${t}`;
			return `, ${low(t.replace(/^,\s*/, ""))}`;
		case "frame":
			t = t.replace(/[.!?]+$/, "").replace(/^,\s*/, "");
			if (/^[A-Z]/.test(t) && !/^And\b/.test(t)) return `. ${t}`;
			return `, and ${low(t.replace(/^and\s+/i, ""))}`;
		case "clause":
			return endP(/^It\b/.test(t) ? low(t) : t);
		case "slot":
			return ` ${endP(cap(t))}`;
		case "raw":
			return t;
		default:
			return endP(cap(t));
	}
}
/** Live text while the learner types: placed like the final sentence, minus the full stop they haven't typed yet. */
export function liveFit(kind: string, t: string) {
	if (!t.trim()) return "";
	const f = fitText(kind, t);
	return /\.$/.test(f) && !/[.!?…~)"”]$/.test(t.trim()) ? f.slice(0, -1) : f;
}
