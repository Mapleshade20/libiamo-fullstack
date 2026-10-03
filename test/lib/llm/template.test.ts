import { describe, expect, it } from "vitest";
import { fillTemplate, TemplateError, templateVariables, unknownTemplateVariables } from "$lib/llm/template";

describe("slot templates", () => {
	it("fills every placeholder, tolerating inner whitespace, without re-scanning inserted values", () => {
		expect(fillTemplate("{{a}} and {{ b }}", { a: "{{b}}", b: "x" })).toBe("{{b}} and x");
	});

	it("rejects placeholders that have no value", () => {
		expect(() => fillTemplate("Hello {{name}}", {})).toThrow(TemplateError);
	});

	it("lists used and unknown variables", () => {
		expect(templateVariables("{{a}} {{b}} {{a}}")).toEqual(["a", "b"]);
		expect(unknownTemplateVariables("{{a}} {{c}}", ["a", "b"])).toEqual(["c"]);
	});
});
