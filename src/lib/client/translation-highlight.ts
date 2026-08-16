/**
 * Exact-match highlighter for overview first-draft text.
 * Only exact containment is used — no fuzzy matching.
 */

import type { TranslationCardWarning } from "$lib/translation-evaluation/types";

export type HighlightInterval = { start: number; end: number };

function overlapsAny(a: HighlightInterval, list: HighlightInterval[]): boolean {
	return list.some((b) => a.start < b.end && b.start < a.end);
}

export type OverviewHighlightTone = "issue" | "warning";
export type OverviewHighlightNeedle = { text: string; tone: OverviewHighlightTone };
export type OverviewHighlightInterval = HighlightInterval & { tone: OverviewHighlightTone };
export type OverviewHighlightSegment = { kind: "plain"; text: string } | { kind: "highlight"; text: string; tone: OverviewHighlightTone };

type OverviewHighlightCard = {
	originalAnswer: string;
	warnings: readonly TranslationCardWarning[];
};

/**
 * Unmatched learner text cannot be located safely. Other unverified cards remain
 * locatable and use a warning tone instead of disappearing from the overview.
 */
export function getOverviewHighlightNeedles(cards: readonly OverviewHighlightCard[]): OverviewHighlightNeedle[] {
	return cards.flatMap((card) => {
		if (card.warnings.includes("answer_unmatched")) return [];
		return [{ text: card.originalAnswer, tone: card.warnings.length > 0 ? "warning" : "issue" }];
	});
}

/** Find exact, non-overlapping overview highlights while preserving their tone. */
export function findExactOverviewHighlightIntervals(text: string, needles: readonly OverviewHighlightNeedle[]): OverviewHighlightInterval[] {
	const intervals: OverviewHighlightInterval[] = [];
	const used: HighlightInterval[] = [];
	const ordered = needles
		.map((needle, index) => ({ needle, index }))
		.sort((left, right) => right.needle.text.length - left.needle.text.length || left.index - right.index);

	for (const { needle } of ordered) {
		if (!needle.text) continue;
		let from = 0;
		while (from <= text.length - needle.text.length) {
			const start = text.indexOf(needle.text, from);
			if (start === -1) break;
			const candidate = { start, end: start + needle.text.length };
			if (!overlapsAny(candidate, used)) {
				intervals.push({ ...candidate, tone: needle.tone });
				used.push(candidate);
				break;
			}
			from = start + 1;
		}
	}

	return intervals.sort((left, right) => left.start - right.start || left.end - right.end);
}

/** Split first-draft text into plain and tone-aware highlight segments. */
export function segmentOverviewHighlightedText(text: string, intervals: readonly OverviewHighlightInterval[]): OverviewHighlightSegment[] {
	if (intervals.length === 0) return [{ kind: "plain", text }];
	const segments: OverviewHighlightSegment[] = [];
	let cursor = 0;
	for (const interval of intervals) {
		if (interval.start > cursor) segments.push({ kind: "plain", text: text.slice(cursor, interval.start) });
		segments.push({ kind: "highlight", text: text.slice(interval.start, interval.end), tone: interval.tone });
		cursor = interval.end;
	}
	if (cursor < text.length) segments.push({ kind: "plain", text: text.slice(cursor) });
	return segments;
}
