import { describe, expect, it } from "vitest";
import {
	findExactHighlightIntervals,
	findExactOverviewHighlightIntervals,
	getOverviewHighlightNeedles,
	mergeIntervals,
	segmentHighlightedText,
	segmentOverviewHighlightedText,
} from "$lib/client/translation-highlight";

describe("translation-highlight", () => {
	it("finds exact first occurrences and merges overlaps", () => {
		const text = "alpha beta gamma beta";
		const intervals = findExactHighlightIntervals(text, ["alpha beta", "beta gamma"]);
		// first needle takes "alpha beta"; second starts at remaining "beta gamma" after first?
		// "beta gamma" at index of first "beta" overlaps "alpha beta" end — skip, next "beta" at end has no "gamma"
		// Actually: first match [0,10] "alpha beta"; second "beta gamma" at index 6 overlaps → search next from 7 → "beta" at 17 has no gamma after fully
		// So only one interval
		expect(intervals.length).toBeGreaterThanOrEqual(1);
		expect(text.slice(intervals[0].start, intervals[0].end)).toBe("alpha beta");
	});

	it("does not guess positions for missing needles", () => {
		const intervals = findExactHighlightIntervals("hello world", ["missing"]);
		expect(intervals).toEqual([]);
	});

	it("merges adjacent and overlapping intervals", () => {
		expect(
			mergeIntervals([
				{ start: 0, end: 5 },
				{ start: 3, end: 8 },
				{ start: 10, end: 12 },
			]),
		).toEqual([
			{ start: 0, end: 8 },
			{ start: 10, end: 12 },
		]);
	});

	it("segments text for plain rendering", () => {
		const segs = segmentHighlightedText("abcdef", [{ start: 2, end: 4 }]);
		expect(segs).toEqual([
			{ kind: "plain", text: "ab" },
			{ kind: "highlight", text: "cd" },
			{ kind: "plain", text: "ef" },
		]);
	});

	it("handles empty intervals", () => {
		expect(segmentHighlightedText("abc", [])).toEqual([{ kind: "plain", text: "abc" }]);
	});

	it("omits only answer-unmatched cards and gives other warnings a warning tone", () => {
		expect(
			getOverviewHighlightNeedles([
				{ originalAnswer: "verified", warnings: [] },
				{ originalAnswer: "bad source", warnings: ["source_unmatched"] },
				{ originalAnswer: "bad diff", warnings: ["minimal_diff_invalid"] },
				{ originalAnswer: "bad reference", warnings: ["reference_marked_invalid"] },
				{ originalAnswer: "duplicate", warnings: ["duplicate"] },
				{ originalAnswer: "missing", warnings: ["answer_unmatched"] },
				{ originalAnswer: "missing with another warning", warnings: ["answer_unmatched", "duplicate"] },
			]),
		).toEqual([
			{ text: "verified", tone: "issue" },
			{ text: "bad source", tone: "warning" },
			{ text: "bad diff", tone: "warning" },
			{ text: "bad reference", tone: "warning" },
			{ text: "duplicate", tone: "warning" },
		]);
	});

	it("preserves overview highlight tones through exact matching and segmentation", () => {
		const text = "verified then warning";
		const intervals = findExactOverviewHighlightIntervals(text, [
			{ text: "verified", tone: "issue" },
			{ text: "warning", tone: "warning" },
		]);

		expect(segmentOverviewHighlightedText(text, intervals)).toEqual([
			{ kind: "highlight", text: "verified", tone: "issue" },
			{ kind: "plain", text: " then " },
			{ kind: "highlight", text: "warning", tone: "warning" },
		]);
	});
});
