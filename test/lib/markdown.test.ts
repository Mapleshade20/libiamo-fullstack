import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/lib/markdown";

describe("renderMarkdown", () => {
	it("strips raw HTML while preserving markdown output", () => {
		const html = renderMarkdown("# Safe Heading\n\n<script>alert('xss')</script>\n\n**bold**");

		expect(html).toContain("<h1>Safe Heading</h1>");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("alert('xss')");
	});
});
