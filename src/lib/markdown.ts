import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

export function renderMarkdown(source: string, options?: { breaks?: boolean }): string {
	const raw = marked.parse(source, {
		async: false,
		gfm: true,
		breaks: options?.breaks ?? true,
	});
	return DOMPurify.sanitize(raw, {
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z])/i,
	});
}
