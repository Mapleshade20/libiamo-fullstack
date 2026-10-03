import { describe, expect, it } from "vitest";
import { isRetryableCell, type LabCellSummary, summarizeRun } from "$lib/llm/lab";

function cell(overrides: Partial<LabCellSummary>): LabCellSummary {
	return {
		variantKey: "a",
		status: "done",
		traceStatus: "ok",
		repaired: false,
		latencyMs: 100,
		completionTokens: 10,
		judge: null,
		votes: [],
		...overrides,
	};
}

describe("summarizeRun", () => {
	it("aggregates outcomes, means, judge scores and votes per variant", () => {
		const [a, b] = summarizeRun(
			["a", "b"],
			[
				cell({ latencyMs: 100, judge: { score: 4, rationale: "" }, votes: [1] }),
				cell({ latencyMs: 300, repaired: true, judge: { score: 2, rationale: "" }, votes: [-1, 1] }),
				cell({ traceStatus: "error", latencyMs: 9_000, judge: { error: "x" } }),
				cell({ status: "pending", traceStatus: null, latencyMs: null }),
				cell({ variantKey: "b", status: "failed", traceStatus: null, latencyMs: null }),
			],
		);
		expect(a).toMatchObject({
			total: 4,
			finished: 3,
			ok: 2,
			failed: 1,
			repaired: 1,
			meanLatencyMs: 200,
			meanJudgeScore: 3,
			judged: 2,
			upVotes: 2,
			downVotes: 1,
		});
		expect(b).toMatchObject({ total: 1, finished: 1, ok: 0, failed: 1, meanLatencyMs: null, meanJudgeScore: null });
	});
});

describe("isRetryableCell", () => {
	it("retries cells that could not run, were cancelled, or whose model call failed", () => {
		expect(isRetryableCell({ status: "failed", traceStatus: null })).toBe(true);
		expect(isRetryableCell({ status: "cancelled", traceStatus: null })).toBe(true);
		expect(isRetryableCell({ status: "done", traceStatus: "error" })).toBe(true);
		expect(isRetryableCell({ status: "done", traceStatus: "ok" })).toBe(false);
		expect(isRetryableCell({ status: "running", traceStatus: null })).toBe(false);
		expect(isRetryableCell({ status: "pending", traceStatus: null })).toBe(false);
	});
});
