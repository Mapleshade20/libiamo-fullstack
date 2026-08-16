import { describe, expect, it } from "vitest";
import { findExactOverviewHighlightIntervals, getOverviewHighlightNeedles, segmentOverviewHighlightedText } from "$lib/client/translation-highlight";

describe("translation-highlight", () => {
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

	it("assigns nested matches longest-first like server validation", () => {
		const text = "I go there, then go there again.";
		const intervals = findExactOverviewHighlightIntervals(text, [
			{ text: "go there", tone: "warning" },
			{ text: "I go there", tone: "issue" },
		]);

		expect(intervals.map((interval) => ({ text: text.slice(interval.start, interval.end), tone: interval.tone }))).toEqual([
			{ text: "I go there", tone: "issue" },
			{ text: "go there", tone: "warning" },
		]);
	});
});
