import { describe, expect, it } from "vitest";
import { parseJsonContent, splitPromptSections, splitTaggedText } from "$lib/llm/prompt-view";

describe("splitPromptSections", () => {
	it("keeps the preamble untitled and splits at level-two headings", () => {
		expect(splitPromptSections("Intro line\n\n## ROLE\nBe kind.\n### Not a split\n## CONTRACT\nJSON only.")).toEqual([
			{ title: null, body: "Intro line" },
			{ title: "ROLE", body: "Be kind.\n### Not a split" },
			{ title: "CONTRACT", body: "JSON only." },
		]);
	});

	it("returns one untitled section for prompts without headings", () => {
		expect(splitPromptSections("Just text")).toEqual([{ title: null, body: "Just text" }]);
	});
});

describe("parseJsonContent", () => {
	it("parses JSON objects and arrays only", () => {
		expect(parseJsonContent(' {"a":1} ')).toEqual({ value: { a: 1 } });
		expect(parseJsonContent("[1]")).toEqual({ value: [1] });
		expect(parseJsonContent("{not json")).toBeNull();
		expect(parseJsonContent("plain")).toBeNull();
	});
});

describe("splitTaggedText", () => {
	it("splits known tags and leaves everything else as text", () => {
		expect(splitTaggedText("Yo <grammar>tener</grammar> un <b>x</b> <vocab>coche</vocab>", ["grammar", "vocab"])).toEqual([
			{ tag: null, text: "Yo " },
			{ tag: "grammar", text: "tener" },
			{ tag: null, text: " un <b>x</b> " },
			{ tag: "vocab", text: "coche" },
		]);
	});
});
