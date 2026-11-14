/** Apply non-overlapping edits to `text`; returns the new text and a position map from old to new offsets. */
export function applyEdits(text: string, edits: { from: number; to: number; after: string }[]) {
	const sorted = [...edits].sort((a, b) => a.from - b.from);
	let out = "";
	let pos = 0;
	const marks: { from: number; to: number; nf: number; nt: number }[] = [];
	for (const e of sorted) {
		if (e.from < pos) continue;
		out += text.slice(pos, e.from);
		const nf = out.length;
		// A pure insertion between two words needs its own spaces (hunks are trimmed).
		const pad = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
		// Any edit that would glue two words together gets a space ("matters" + "hugely.").
		const lead = e.after && pad(out.at(-1)) && pad(e.after[0]) ? " " : "";
		const tail = e.after && pad(text[e.to]) && pad(e.after.at(-1)) ? " " : "";
		out += e.from === e.to ? `${pad(out.at(-1)) ? " " : ""}${e.after}${pad(text[e.to]) ? " " : ""}` : `${lead}${e.after}${tail}`;
		// A deletion between two spaces would leave a double space, so it takes the space after it too; the map must
		// count that space, or every position after it is off by one.
		pos = e.after === "" && out.endsWith(" ") && text[e.to] === " " ? e.to + 1 : e.to;
		marks.push({ from: e.from, to: pos, nf, nt: out.length });
	}
	out += text.slice(pos);
	const map = (p: number, side: "from" | "to") => {
		let delta = 0;
		for (const m of marks) {
			if (p >= m.to) delta = m.nt - m.to;
			else if (p > m.from || (p === m.from && side === "to")) return side === "from" ? m.nf : m.nt;
			else break;
		}
		return p + delta;
	};
	/** The other way: a position in the edited text back to the original (inside an edit, to its edge). */
	const inv = (p: number, side: "from" | "to") => {
		let delta = 0;
		for (const m of marks) {
			if (p >= m.nt && !(p === m.nt && m.nf === m.nt && side === "from")) delta = m.to - m.nt;
			else if (p > m.nf || (p === m.nf && side === "to" && m.nt > m.nf)) return side === "from" ? m.from : m.to;
			else break;
		}
		return p + delta;
	};
	return { text: out, map, inv };
}
