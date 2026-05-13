export function prepareMarkdownText(text: string): string {
	if (!text) return "";

	return text.replace(/\r\n?/g, "\n").trim();
}

export function stripBasicMarkdown(text: string): string {
	if (!text) return "";

	return text
		.replace(/\*\*([^\n]{1,500}?)\*\*/g, "$1")
		.replace(/\*([^\n]{1,500}?)\*/g, "$1")
		.replace(/__([^\n]{1,500}?)__/g, "$1")
		.replace(/~~([^\n]{1,500}?)~~/g, "$1")
		.replace(/#{1,6}[ \t]+/g, "")
		.replace(/\[([^\n]{1,200}?)\]\(([^\n]{1,1000}?)\)/g, "$1")
		.replace(/\r\n?/g, "\n")
		.trim();
}

export function isEmptyMarkdown(text: string): boolean {
	return !prepareMarkdownText(text).trim();
}

export function ensureMarkdownContent(text: string, fallback = ""): string {
	const normalized = prepareMarkdownText(text);
	return normalized || fallback;
}
