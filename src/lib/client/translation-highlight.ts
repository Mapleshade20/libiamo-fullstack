/**
 * Exact-match highlighter for overview first-draft text.
 * Only exact containment is used — no fuzzy matching.
 */

export type HighlightInterval = { start: number; end: number };

/**
 * Find non-overlapping intervals in `text` that exactly match any of `needles`.
 * Overlaps are merged into a union. First occurrence of each needle is preferred;
 * subsequent needles may match later occurrences if earlier ranges are already taken.
 */
export function findExactHighlightIntervals(text: string, needles: string[]): HighlightInterval[] {
	const raw: HighlightInterval[] = [];
	const used: HighlightInterval[] = [];

	for (const needle of needles) {
		if (!needle) continue;
		let from = 0;
		while (from <= text.length - needle.length) {
			const idx = text.indexOf(needle, from);
			if (idx === -1) break;
			const candidate = { start: idx, end: idx + needle.length };
			if (!overlapsAny(candidate, used)) {
				raw.push(candidate);
				used.push(candidate);
				break;
			}
			from = idx + 1;
		}
	}

	return mergeIntervals(raw);
}

function overlapsAny(a: HighlightInterval, list: HighlightInterval[]): boolean {
	return list.some((b) => a.start < b.end && b.start < a.end);
}

export function mergeIntervals(intervals: HighlightInterval[]): HighlightInterval[] {
	if (intervals.length === 0) return [];
	const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
	const out: HighlightInterval[] = [{ ...sorted[0] }];
	for (let i = 1; i < sorted.length; i++) {
		const last = out[out.length - 1];
		const cur = sorted[i];
		if (cur.start <= last.end) {
			last.end = Math.max(last.end, cur.end);
		} else {
			out.push({ ...cur });
		}
	}
	return out;
}

export type HighlightSegment = { kind: "plain"; text: string } | { kind: "highlight"; text: string };

/** Split text into plain/highlight segments for rendering without {@html}. */
export function segmentHighlightedText(text: string, intervals: HighlightInterval[]): HighlightSegment[] {
	if (intervals.length === 0) return [{ kind: "plain", text }];
	const segments: HighlightSegment[] = [];
	let cursor = 0;
	for (const interval of intervals) {
		if (interval.start > cursor) {
			segments.push({ kind: "plain", text: text.slice(cursor, interval.start) });
		}
		segments.push({ kind: "highlight", text: text.slice(interval.start, interval.end) });
		cursor = interval.end;
	}
	if (cursor < text.length) {
		segments.push({ kind: "plain", text: text.slice(cursor) });
	}
	return segments;
}
