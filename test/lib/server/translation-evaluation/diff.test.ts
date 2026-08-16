import { describe, expect, it } from "vitest";
import { parseTranslationDiff } from "$lib/server/translation-evaluation/diff";

describe("restricted translation Diff parser", () => {
	it("parses unchanged text and every allowed operation into an AST", () => {
		expect(
			parseTranslationDiff("Keep <delete>old</delete><add>new</add> and <replace><from>less natural</from><to>more natural</to></replace>."),
		).toEqual({
			success: true,
			parts: [
				{ type: "unchanged", text: "Keep " },
				{ type: "delete", text: "old" },
				{ type: "add", text: "new" },
				{ type: "unchanged", text: " and " },
				{ type: "replace", from: "less natural", to: "more natural" },
				{ type: "unchanged", text: "." },
			],
		});
	});

	it("decodes only the three protocol entities", () => {
		expect(parseTranslationDiff("A &amp; B <replace><from>&lt;x&gt;</from><to>&gt;y&lt;</to></replace>")).toEqual({
			success: true,
			parts: [
				{ type: "unchanged", text: "A & B " },
				{ type: "replace", from: "<x>", to: ">y<" },
			],
		});
	});

	it("parses replace operations with one empty side as deletion or insertion", () => {
		expect(parseTranslationDiff("personal <replace><from>growth </from><to></to></replace>history")).toEqual({
			success: true,
			parts: [
				{ type: "unchanged", text: "personal " },
				{ type: "replace", from: "growth ", to: "" },
				{ type: "unchanged", text: "history" },
			],
		});
		expect(parseTranslationDiff("<replace><from></from><to>new </to></replace>text").success).toBe(true);
	});

	it.each([
		["unknown HTML", "<script>alert(1)</script>"],
		["attributes", '<add class="x">new</add>'],
		["nested operations", "<add>new <delete>old</delete></add>"],
		["incomplete replace", "<replace><from>old</from></replace>"],
		["empty operation", "<delete></delete>"],
		["empty replace", "<replace><from></from><to></to></replace>"],
		["unknown entity", "A&nbsp;B"],
		["unescaped ampersand", "A & B"],
		["unescaped greater-than", "A > B"],
	])("rejects %s", (_label, input) => {
		expect(parseTranslationDiff(input).success).toBe(false);
	});

	it("does not require the Diff to reconstruct any expected answer", () => {
		expect(parseTranslationDiff("Completely unrelated but <add>valid</add> syntax").success).toBe(true);
	});
});
