import { describe, expect, it } from "vitest";
import { prepareMarkdownText } from "$lib/components/utils/markdownUtils";

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
});
