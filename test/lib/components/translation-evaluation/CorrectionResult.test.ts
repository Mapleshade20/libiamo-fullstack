import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import CorrectionResult from "$lib/components/translate-evaluation/CorrectionResult.svelte";

describe("CorrectionResult", () => {
	it("renders safe referenceMarked parts as clickable semantic marks", () => {
		const referenceAnswer = "The complete reference answer, unchanged.";
		const { body } = render(CorrectionResult, {
			props: {
				primaryDiff: [{ type: "replace", from: "Old", to: "New" }],
				primaryLabel: "Minimal changes",
				referenceAnswer,
				referenceMarked: [
					{ type: "text", content: "The complete " },
					{ type: "mark", content: "reference answer" },
					{ type: "text", content: ", unchanged." },
				],
				referenceLabel: "Reference",
			},
		});

		expect(body).toContain("The complete ");
		expect(body).toContain("reference answer</mark>");
		expect(body).toContain(", unchanged.");
		expect(body).toContain('<mark role="button" tabindex="0"');
		expect(body).toContain("bg-yellow-200/60");
		expect(body.match(/class="diff-view/g)).toHaveLength(1);
		expect(body).not.toContain("diff-reference");
		expect(body).not.toContain('<span role="button"');
	});
});
