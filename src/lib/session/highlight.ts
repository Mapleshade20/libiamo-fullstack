/*
 * The map's highlight as one shape: the lines a passage covers are stacked into a single outline (lines of a paragraph
 * meet halfway between them), and every corner, outer or inner, is rounded. A new paragraph, or two lines that do not
 * overlap, start a new shape.
 */
const R = 6;
type Line = { para: Element | null; top: number; bottom: number; l: number; r: number };

function lines(els: Element[], box: DOMRect): Line[] {
	// Neighbouring items with only spaces between them are one passage, so the spaces are covered too.
	const runs: { start: Element; end: Element }[] = [];
	for (const el of [...els].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))) {
		const last = runs.at(-1);
		if (last && last.end.closest(".para") === el.closest(".para")) {
			const gap = document.createRange();
			gap.setStartAfter(last.end);
			gap.setEndBefore(el);
			if (!gap.toString().trim() && !gap.cloneContents().querySelector(".item:not(.hl)")) {
				last.end = el;
				continue;
			}
		}
		runs.push({ start: el, end: el });
	}
	const out: Line[] = [];
	for (const run of runs) {
		const range = document.createRange();
		range.setStartBefore(run.start);
		range.setEndAfter(run.end);
		const para = run.start.closest(".para");
		const own: Line[] = [];
		for (const c of range.getClientRects()) {
			if (c.width < 1) continue;
			const top = c.top - box.top;
			const bottom = c.bottom - box.top;
			const l = c.left - box.left;
			const r = c.right - box.left;
			const same = own.find((x) => Math.abs((x.top + x.bottom) / 2 - (top + bottom) / 2) < 4);
			if (same)
				Object.assign(same, { l: Math.min(same.l, l), r: Math.max(same.r, r), top: Math.min(same.top, top), bottom: Math.max(same.bottom, bottom) });
			else own.push({ para, top, bottom, l, r });
		}
		// A passage that wraps is a block: every line but its last reaches the column's right edge, every line but its
		// first starts at the left, so the ragged ends of the lines it fills do not show.
		own.sort((a, b) => a.top - b.top);
		own.forEach((ln, k) => {
			if (k < own.length - 1) ln.r = box.width;
			if (k > 0) ln.l = 0;
		});
		for (const ln of own) {
			const same = out.find((x) => x.para === para && Math.abs((x.top + x.bottom) / 2 - (ln.top + ln.bottom) / 2) < 4);
			if (same)
				Object.assign(same, {
					l: Math.min(same.l, ln.l),
					r: Math.max(same.r, ln.r),
					top: Math.min(same.top, ln.top),
					bottom: Math.max(same.bottom, ln.bottom),
				});
			else out.push(ln);
		}
	}
	return out.sort((a, b) => a.top - b.top);
}

function shapes(ls: Line[]) {
	const out: Line[][] = [];
	for (const ln of ls) {
		const prev = out.at(-1)?.at(-1);
		if (prev && prev.para === ln.para && ln.top - prev.bottom < prev.bottom - prev.top && ln.l < prev.r && ln.r > prev.l) {
			const mid = (prev.bottom + ln.top) / 2;
			prev.bottom = mid;
			out.at(-1)?.push({ ...ln, top: mid });
		} else out.push([{ ...ln }]);
	}
	// A little air around the text at the outer edges.
	for (const sh of out) {
		sh[0].top -= 2;
		(sh.at(-1) as Line).bottom += 2;
		for (const ln of sh) {
			ln.l -= 3;
			ln.r += 3;
		}
	}
	return out;
}

/** A rectilinear outline (right side down, left side up) with every corner rounded. */
function path(sh: Line[]) {
	let pts: [number, number][] = [];
	for (const ln of sh) pts.push([ln.r, ln.top], [ln.r, ln.bottom]);
	for (const ln of [...sh].reverse()) pts.push([ln.l, ln.bottom], [ln.l, ln.top]);
	// Drop repeated points and points in the middle of a straight edge.
	pts = pts.filter((p, i) => {
		const q = pts[(i + pts.length - 1) % pts.length];
		return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5;
	});
	pts = pts.filter((p, i) => {
		const a = pts[(i + pts.length - 1) % pts.length];
		const b = pts[(i + 1) % pts.length];
		return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 0.5;
	});
	const n = pts.length;
	let d = "";
	for (let i = 0; i < n; i++) {
		const [a, p, b] = [pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n]];
		const r = Math.min(R, Math.hypot(p[0] - a[0], p[1] - a[1]) / 2, Math.hypot(b[0] - p[0], b[1] - p[1]) / 2);
		const toward = (q: [number, number]) => {
			const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
			return [p[0] + ((q[0] - p[0]) / len) * r, p[1] + ((q[1] - p[1]) / len) * r];
		};
		const [s0, s1] = [toward(a), toward(b)];
		d += `${i ? "L" : "M"}${s0[0].toFixed(1)},${s0[1].toFixed(1)}Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${s1[0].toFixed(1)},${s1[1].toFixed(1)}`;
	}
	return `${d}Z`;
}

/** The outline of these items, relative to `host`. */
export const outline = (els: Element[], host: Element) => shapes(lines(els, host.getBoundingClientRect())).map(path).join("");
