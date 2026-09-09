import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

export function renderMarkdown(source: string, options?: { breaks?: boolean; headingOffset?: number }): string {
	const raw = marked.parse(source, {
		async: false,
		gfm: true,
		breaks: options?.breaks ?? true,
	});
	const sanitized = DOMPurify.sanitize(raw, {
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z])/i,
	});
	const headingOffset = Math.max(0, Math.floor(options?.headingOffset ?? 0));
	if (headingOffset === 0) return sanitized;
	return sanitized.replace(/<(\/?)h([1-6])(\b[^>]*)>/gi, (_, closing: string, level: string, attributes: string) => {
		const shiftedLevel = Math.min(6, Number(level) + headingOffset);
		return `<${closing}h${shiftedLevel}${attributes}>`;
	});
}
