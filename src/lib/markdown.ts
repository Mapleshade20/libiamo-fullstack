import { Marked } from "marked";

const markdownRenderer = new Marked({
	renderer: {
		// Drop raw HTML so Markdown-authored content can't inject scripts into {@html}.
		html() {
			return "";
		},
	},
});

export function renderMarkdown(source: string): string {
	return markdownRenderer.parse(source) as string;
}
