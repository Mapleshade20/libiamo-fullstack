/** Helpers for reading prompts and outputs in the LLM Lab. */

export type PromptSection = { title: string | null; body: string };

/** Splits a prompt at Markdown `## ` headings; text before the first heading has no title. */
export function splitPromptSections(text: string): PromptSection[] {
	const sections: PromptSection[] = [];
	let current: PromptSection = { title: null, body: "" };
	for (const line of text.split("\n")) {
		const heading = /^##\s+(.+?)\s*$/.exec(line);
		if (heading) {
			if (current.title !== null || current.body.trim()) sections.push({ ...current, body: current.body.trim() });
			current = { title: heading[1], body: "" };
		} else {
			current.body += `${line}\n`;
		}
	}
	if (current.title !== null || current.body.trim()) sections.push({ ...current, body: current.body.trim() });
	return sections;
}

/** The parsed JSON value of a message, or null when it is plain text. */
export function parseJsonContent(content: string): { value: unknown } | null {
	const trimmed = content.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
	try {
		return { value: JSON.parse(trimmed) };
	} catch {
		return null;
	}
}

export type TaggedSegment = { tag: string | null; text: string };

/**
 * Splits text with flat inline tags (`<grammar>…</grammar>`, `<mark>…</mark>`) into segments, so
 * model markup renders as styled text without ever becoming HTML. Unknown or unbalanced tags stay text.
 */
export function splitTaggedText(text: string, tags: readonly string[]): TaggedSegment[] {
	const names = tags.map((tag) => tag.replace(/[^a-z0-9_-]/gi, "")).join("|");
	const pattern = new RegExp(`<(${names})>([\\s\\S]*?)</\\1>`, "g");
	const segments: TaggedSegment[] = [];
	let last = 0;
	for (const match of text.matchAll(pattern)) {
		if (match.index > last) segments.push({ tag: null, text: text.slice(last, match.index) });
		segments.push({ tag: match[1], text: match[2] });
		last = match.index + match[0].length;
	}
	if (last < text.length) segments.push({ tag: null, text: text.slice(last) });
	return segments;
}
