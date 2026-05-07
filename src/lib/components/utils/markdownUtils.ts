export function prepareMarkdownText(text: string): string {
	if (!text) return "";
	return text.trim().replace(/\r\n/g, "  \n").replace(/\n/g, "  \n");
}

export function isEmptyMarkdown(text: string): boolean {
	return !text?.trim();
}

export function stripBasicMarkdown(text: string): string {
	if (!text) return "";

	return text
		.replace(/\*\*([^*\n]+)\*\*/g, "$1")
		.replace(/\*([^*\n]+)\*/g, "$1")
		.replace(/__([^\n_]+)__/g, "$1")
		.replace(/~~([^\n~]+)~~/g, "$1")
		.replace(/#{1,6}\s+/g, "")
		.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
		.trim();
}

export function ensureMarkdownContent(text: string, fallback = ""): string {
	const normalized = prepareMarkdownText(text);
	return normalized || fallback;
}
