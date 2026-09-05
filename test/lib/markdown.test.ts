import { describe, expect, it } from "vitest";
import { renderMarkdown } from "$lib/markdown";

describe("renderMarkdown", () => {
	it("preserves model line breaks and numbered-list structure", () => {
		const html = renderMarkdown("这句话有两个问题：\n1. 第一项\n2. 第二项");

		expect(html).toContain("<p>这句话有两个问题：</p>");
		expect(html).toContain("<ol>");
		expect(html).toContain("<li>第一项</li>");
		expect(html).toContain("<li>第二项</li>");
	});

	it("preserves safe HTML while stripping dangerous elements", () => {
		const html = renderMarkdown("# Heading\n\n<style>.x{color:red}</style>\n\n**bold**\n\n<script>alert('xss')</script>");

		expect(html).toContain("<h1>Heading</h1>");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<style>.x{color:red}</style>");
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("alert('xss')");
	});

	it("neutralizes javascript: protocol in links", () => {
		const html = renderMarkdown("[click me](javascript:alert('xss'))");

		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("alert");
	});

	it("neutralizes data: protocol in links", () => {
		const html = renderMarkdown("[click me](data:text/html,<script>alert(1)</script>)");

		expect(html).not.toContain("data:");
		expect(html).not.toContain("<script>");
	});

	it("neutralizes javascript: protocol in images", () => {
		const html = renderMarkdown("![img](javascript:alert('xss'))");

		expect(html).not.toContain("javascript:");
	});

	it("preserves legitimate https links", () => {
		const html = renderMarkdown("[example](https://example.com)");

		expect(html).toContain('href="https://example.com"');
	});

	it("preserves legitimate mailto links", () => {
		const html = renderMarkdown("[email](mailto:test@example.com)");

		expect(html).toContain('href="mailto:test@example.com"');
	});

	it("strips event handler attributes from raw HTML", () => {
		const html = renderMarkdown('<img src="x" onerror="alert(1)">');

		expect(html).not.toContain("onerror");
	});

	it("shifts sanitized heading levels for embedded document sections", () => {
		const html = renderMarkdown("## Materials\n\n### Vocabulary", { headingOffset: 2 });

		expect(html).toContain("<h4>Materials</h4>");
		expect(html).toContain("<h5>Vocabulary</h5>");
	});
});
