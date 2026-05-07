import { describe, expect, it } from "vitest";
import { ensureMarkdownContent, prepareMarkdownText } from "$lib/components/utils/markdownUtils";

describe("markdownUtils", () => {
	it("strips markdown formatting safely", () => {
		const input = "**Bold** and *Italic* and __Underline__ and ~~Strike~~";
		expect(prepareMarkdownText(input)).toBe("Bold and Italic and Underline and Strike");
	});

	it("removes headers and extracts links", () => {
		const input = "### Header\nClick [here](https://example.com) to view";
		expect(prepareMarkdownText(input)).toBe("Header\nClick here to view");
	});

	it("ensureMarkdownContent returns correct fallback", () => {
		expect(ensureMarkdownContent("   ", "Fallback Text")).toBe("Fallback Text");
		expect(ensureMarkdownContent("**Valid**", "Fallback Text")).toBe("Valid");
	});
});
