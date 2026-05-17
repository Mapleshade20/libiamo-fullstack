import DOMPurify from "isomorphic-dompurify";
import { normalizeText } from "../../utils/messageUtils";
import type { ChatMessage } from "../chatMessages";
import type { DraftEmail } from "./types";

const mailBodyHtmlMaxLength = 20000;

function escapeHtml(value: string) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function plainTextToDraftHtml(value: string) {
	if (!value) return "";
	return value
		.split("\n")
		.map((line) => `<div>${line ? escapeHtml(line) : "<br>"}</div>`)
		.join("");
}

export function appendPlainTextToDraftHtml(existingHtml: string | undefined, text: string, separate = true) {
	const trimmedExistingHtml = existingHtml?.trim() ?? "";
	const nextHtml = plainTextToDraftHtml(text);
	if (!trimmedExistingHtml) return nextHtml;
	return `${trimmedExistingHtml}${separate ? "<div><br></div>" : ""}${nextHtml}`;
}

export function sanitizeDraftBodyHtml(value: string | undefined, maxLength = mailBodyHtmlMaxLength) {
	const trimmed = value?.trim() ?? "";
	if (!trimmed) return "";

	const limited = trimmed.slice(0, maxLength);
	return DOMPurify.sanitize(limited, {
		ALLOWED_TAGS: ["b", "blockquote", "br", "div", "em", "font", "i", "li", "ol", "p", "s", "span", "strike", "strong", "u", "ul"],
		ALLOWED_ATTR: ["align", "color", "size", "style"],
		FORBID_TAGS: ["script", "style"],
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z])/i,
	}).trim();
}

export function normalizeMailBodySpacing(value: string) {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function formatDraftMessage(value: DraftEmail, noSubjectLabel: string) {
	const subject = normalizeText(value.subject, noSubjectLabel);
	return `To: ${value.to.trim()}\nSubject: ${subject}\n\n${normalizeMailBodySpacing(value.body)}`;
}

type PresentationState = {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	color: string;
	fontSize: string;
	largeFont: boolean;
	align: string;
};

const defaultPresentationState: PresentationState = {
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	color: "",
	fontSize: "",
	largeFont: false,
	align: "",
};

function normalizeTextNode(value: string) {
	return value.replace(/\s+/g, " ");
}

function getStyleValue(element: HTMLElement, property: string) {
	return element.style.getPropertyValue(property).trim().toLowerCase();
}

function isBoldElement(element: HTMLElement) {
	const tag = element.tagName.toLowerCase();
	const weight = getStyleValue(element, "font-weight");
	return tag === "b" || tag === "strong" || weight === "bold" || Number.parseInt(weight, 10) >= 600;
}

function parseFontSizeValue(value: string) {
	const normalized = value.trim().toLowerCase();
	const pixelMatch = normalized.match(/^(\d+(?:\.\d+)?)px$/);
	const pointMatch = normalized.match(/^(\d+(?:\.\d+)?)pt$/);
	if (pixelMatch) return { value: normalized, large: Number(pixelMatch[1]) >= 22 };
	if (pointMatch) return { value: normalized, large: Number(pointMatch[1]) >= 16 };
	return { value: normalized, large: false };
}

function getElementPresentationState(element: HTMLElement, inherited: PresentationState): PresentationState {
	const tag = element.tagName.toLowerCase();
	const textDecoration = getStyleValue(element, "text-decoration");
	const color = getStyleValue(element, "color") || element.getAttribute("color")?.trim().toLowerCase() || inherited.color;
	const styleFontSize = getStyleValue(element, "font-size");
	const fontTagSize = tag === "font" ? (element.getAttribute("size")?.trim() ?? "") : "";
	const parsedFontSize = parseFontSizeValue(styleFontSize || fontTagSize);
	const align = getStyleValue(element, "text-align") || element.getAttribute("align")?.trim().toLowerCase() || inherited.align;

	return {
		bold: inherited.bold || isBoldElement(element),
		italic: inherited.italic || tag === "i" || tag === "em" || getStyleValue(element, "font-style") === "italic",
		underline: inherited.underline || tag === "u" || textDecoration.includes("underline"),
		strike: inherited.strike || tag === "s" || tag === "strike" || textDecoration.includes("line-through"),
		color,
		fontSize: parsedFontSize.value || inherited.fontSize,
		largeFont: inherited.largeFont || parsedFontSize.large || (tag === "font" && Number.parseInt(fontTagSize, 10) >= 5),
		align,
	};
}

function hasInlinePresentation(state: PresentationState) {
	return state.bold || state.italic || state.underline || state.strike || Boolean(state.color) || Boolean(state.fontSize) || state.largeFont;
}

function compactStyleValue(value: string) {
	return value.replace(/\s+/g, "");
}

function wrapCoreText(value: string, wrap: (core: string) => string) {
	if (!value.trim()) return value;
	const leading = value.match(/^\s*/)?.[0] ?? "";
	const trailing = value.match(/\s*$/)?.[0] ?? "";
	const core = value.slice(leading.length, value.length - trailing.length);
	return `${leading}${wrap(core)}${trailing}`;
}

function applyPresentationMarkers(text: string, state: PresentationState) {
	if (!hasInlinePresentation(state)) return text;

	return wrapCoreText(text, (core) => {
		let marked = core;
		if (state.bold) marked = `**${marked}**`;
		if (state.italic) marked = `_${marked}_`;
		if (state.underline) marked = `[u]${marked}[/u]`;
		if (state.strike) marked = `[s]${marked}[/s]`;
		if (state.color) marked = `[color=${compactStyleValue(state.color)}]${marked}[/color]`;
		if (state.fontSize || state.largeFont) marked = `[size=${compactStyleValue(state.fontSize || "large")}]${marked}[/size]`;
		return marked;
	});
}

function renderMarkedBody(node: Node, inherited = defaultPresentationState): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return applyPresentationMarkers(normalizeTextNode(node.textContent ?? ""), inherited);
	}

	if (!(node instanceof HTMLElement)) {
		return Array.from(node.childNodes)
			.map((child) => renderMarkedBody(child, inherited))
			.join("");
	}

	const tag = node.tagName.toLowerCase();
	if (tag === "br") return "\n";

	const nextState = getElementPresentationState(node, inherited);
	const renderedChildren = Array.from(node.childNodes)
		.map((child) => renderMarkedBody(child, nextState))
		.join("");

	if (tag === "li") return `- ${renderedChildren.trim()}\n`;
	if (tag === "ul" || tag === "ol") return renderedChildren;

	const blockText =
		nextState.align === "center" || nextState.align === "right" ? `[align=${nextState.align}]${renderedChildren.trim()}[/align]` : renderedChildren;

	if (tag === "div" || tag === "p") return `${blockText}\n`;
	return blockText;
}

function compactMarkedBody(value: string) {
	return value
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function summarizeDraftPresentation(value: DraftEmail) {
	if (typeof DOMParser === "undefined" || !value.bodyHtml?.trim()) {
		return "Presentation: plain text or no rich-text styling detected.";
	}

	const doc = new DOMParser().parseFromString(value.bodyHtml, "text/html");
	const markedBody = compactMarkedBody(renderMarkedBody(doc.body));
	const plainBody = compactMarkedBody(value.body);

	if (!markedBody || markedBody === plainBody) return "Presentation: plain text or no rich-text styling detected.";

	return [
		"Style markup rules: markers describe visual formatting only and are not part of the student's words. **text**=bold, _text_=italic, [u]text[/u]=underline, [s]text[/s]=strikethrough, [color=value]text[/color]=colored text, [size=value]text[/size]=changed font size, [align=value]text[/align]=block alignment.",
		"Evaluation rule: professional emails should usually use plain, consistent body text. Emphasis is appropriate for genuinely important deadlines, headings, or key actions, but styling ordinary words or using color/large fonts casually is distracting and should lower presentation quality.",
		`Marked email body:\n${markedBody}`,
	]
		.join("\n")
		.slice(0, 3500);
}

export function getMailBodyHtmlFromMessage(message: ChatMessage | null | undefined) {
	const metadata = message?.llmMetadata;
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
	const bodyHtml = (metadata as { mailBodyHtml?: unknown }).mailBodyHtml;
	return typeof bodyHtml === "string" ? sanitizeDraftBodyHtml(bodyHtml) : "";
}

export function parseDraftFromMessage(text: string, noSubjectLabel: string, bodyHtmlOverride = ""): DraftEmail {
	const toMatch = text.match(/^To:\s*(.*)$/m);
	const subjectMatch = text.match(/^Subject:\s*(.*)$/m);
	const body = normalizeMailBodySpacing(text.replace(/^To:[^\n]*\nSubject:[^\n]*\n\n?/, ""));
	const bodyHtml = sanitizeDraftBodyHtml(bodyHtmlOverride);
	return {
		to: toMatch?.[1]?.trim() ?? "",
		subject: subjectMatch?.[1]?.trim() ?? noSubjectLabel,
		body,
		bodyHtml: bodyHtml || plainTextToDraftHtml(body),
	};
}
