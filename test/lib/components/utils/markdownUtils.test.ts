import { describe, expect, it } from "vitest";
import { ensureMarkdownContent, prepareMarkdownText, stripBasicMarkdown } from "$lib/components/utils/markdownUtils";

describe("markdownUtils", () => {
	describe("prepareMarkdownText", () => {
		it("normalizes CRLF line endings without stripping markdown", () => {
			const input = "### Header\r\nClick [here](https://example.com) to view";

			expect(prepareMarkdownText(input)).toBe("### Header\nClick [here](https://example.com) to view");
		});

		it("trims surrounding whitespace", () => {
			expect(prepareMarkdownText("  **Valid**  ")).toBe("**Valid**");
		});
	});

	describe("stripBasicMarkdown", () => {
		it("strips markdown formatting safely", () => {
			const input = "**Bold** and *Italic* and __Underline__ and ~~Strike~~";

			expect(stripBasicMarkdown(input)).toBe("Bold and Italic and Underline and Strike");
		});

		it("removes headers and extracts links", () => {
			const input = "### Header\nClick [here](https://example.com) to view";

			expect(stripBasicMarkdown(input)).toBe("Header\nClick here to view");
		});
	});

	describe("ensureMarkdownContent", () => {
		it("returns fallback for empty content", () => {
			expect(ensureMarkdownContent("   ", "Fallback Text")).toBe("Fallback Text");
		});

		it("preserves markdown content", () => {
			expect(ensureMarkdownContent("**Valid**", "Fallback Text")).toBe("**Valid**");
		});
	});
});
