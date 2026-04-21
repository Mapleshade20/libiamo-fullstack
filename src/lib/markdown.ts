import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

export function renderMarkdown(source: string): string {
	const raw = marked.parse(source, { async: false });
	return DOMPurify.sanitize(raw, {
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z])/i,
	});
}
