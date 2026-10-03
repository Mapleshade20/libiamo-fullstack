import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/db", () => ({ db: {} }));

import { unknownTemplateVariables } from "$lib/llm/template";
import { describeRecipe, findRecipe, LLM_RECIPES } from "$lib/server/llm/lab/recipes";

describe("recipe registry", () => {
	it("has unique ids", () => {
		const ids = LLM_RECIPES.map((recipe) => recipe.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("declares every placeholder its default slot templates use", () => {
		for (const recipe of LLM_RECIPES) {
			for (const [name, slot] of Object.entries(recipe.slots ?? {})) {
				expect(unknownTemplateVariables(slot.template, slot.variables), `${recipe.id}.${name}`).toEqual([]);
			}
		}
	});

	it("keeps thinking on at low or medium effort for every call", () => {
		for (const recipe of LLM_RECIPES) expect(["low", "medium"], recipe.id).toContain(recipe.reasoningEffort);
	});

	it("names the temperature an empty field falls back to", () => {
		const describe = (id: string) => describeRecipe(findRecipe(id) ?? LLM_RECIPES[0]).defaultTemperature;
		expect(describe("lab.judge")).toEqual({ value: 0, source: "recipe" });
		// Input-dependent options report their fallback.
		expect(describe("translation.generation-1")).toEqual({ value: 0.4, source: "recipe" });
		expect(describe("review.notes")).toEqual({ value: 1, source: "api" });
	});
});
