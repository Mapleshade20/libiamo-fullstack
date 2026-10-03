import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/llm/providers", () => ({ resolveProviderRef: vi.fn() }));

import { effectiveSlotOverrides, expandRunCells, slotOverrideProblems } from "$lib/server/llm/lab/variants";
import { defineLlmRecipe } from "$lib/server/llm/recipe";

const recipe = defineLlmRecipe({
	id: "test.slots",
	version: 1,
	title: "Slots",
	reasoningEffort: "low",
	output: { kind: "text", parse: (content: string) => content },
	slots: { system: { label: "System", template: "Speak {{language}}.", variables: ["language"] } },
	build: () => [],
});

describe("slot overrides", () => {
	it("reports unknown slots, empty templates and unknown variables", () => {
		expect(slotOverrideProblems(recipe, { system: "Speak {{language}} to {{name}}." })).toEqual([expect.stringContaining("{{name}}")]);
		expect(slotOverrideProblems(recipe, { other: "x" })).toEqual([expect.stringContaining('no slot "other"')]);
		expect(slotOverrideProblems(recipe, { system: " " })).toHaveLength(1);
		expect(slotOverrideProblems(recipe, { system: "Only {{language}}." })).toEqual([]);
	});

	it("keeps only real edits", () => {
		expect(effectiveSlotOverrides(recipe, { system: "Speak {{language}}.", other: "x" })).toEqual({});
		expect(effectiveSlotOverrides(recipe, { system: "Talk {{language}}." })).toEqual({ system: "Talk {{language}}." });
	});
});

describe("expandRunCells", () => {
	it("creates one cell per case, variant and repeat", () => {
		const cells = expandRunCells([1, 2], [{ key: "a" }, { key: "b" }], 2);
		expect(cells).toHaveLength(8);
		expect(cells.slice(0, 3)).toEqual([
			{ caseId: 1, variantKey: "a", repeatIndex: 0 },
			{ caseId: 1, variantKey: "a", repeatIndex: 1 },
			{ caseId: 1, variantKey: "b", repeatIndex: 0 },
		]);
	});
});
