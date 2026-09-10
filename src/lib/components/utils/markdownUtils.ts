export function prepareMarkdownText(text: string): string {
	if (!text) return "";

	return text.replace(/\r\n?/g, "\n").trim();
}
