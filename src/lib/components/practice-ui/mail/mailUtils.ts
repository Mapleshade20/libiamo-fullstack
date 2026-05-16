import { normalizeText } from "../../utils/messageUtils";
import type { DraftEmail } from "./types";

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

export function formatDraftMessage(value: DraftEmail, noSubjectLabel: string) {
	const subject = normalizeText(value.subject, noSubjectLabel);
	return `To: ${value.to.trim()}\nSubject: ${subject}\n\n${value.body.trim()}`;
}

type PresentationStats = {
	totalChars: number;
	boldChars: number;
	boldSegments: number;
	italicChars: number;
	underlineChars: number;
	strikeChars: number;
	coloredChars: number;
	colorValues: Set<string>;
	resizedChars: number;
	largeFontChars: number;
	fontSizeValues: Set<string>;
	centeredOrRightBlocks: number;
	listCount: number;
};

type PresentationState = {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	color: string;
	fontSize: string;
	largeFont: boolean;
};

const defaultPresentationState: PresentationState = {
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	color: "",
	fontSize: "",
	largeFont: false,
};

function normalizeVisibleText(value: string) {
	return value.replace(/\s+/g, " ").trim();
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

	return {
		bold: inherited.bold || isBoldElement(element),
		italic: inherited.italic || tag === "i" || tag === "em" || getStyleValue(element, "font-style") === "italic",
		underline: inherited.underline || tag === "u" || textDecoration.includes("underline"),
		strike: inherited.strike || tag === "s" || tag === "strike" || textDecoration.includes("line-through"),
		color,
		fontSize: parsedFontSize.value || inherited.fontSize,
		largeFont: inherited.largeFont || parsedFontSize.large || (tag === "font" && Number.parseInt(fontTagSize, 10) >= 5),
	};
}

function addTextStats(stats: PresentationStats, state: PresentationState, text: string) {
	const length = normalizeVisibleText(text).length;
	if (!length) return;

	stats.totalChars += length;
	if (state.bold) {
		stats.boldChars += length;
		stats.boldSegments += 1;
	}
	if (state.italic) stats.italicChars += length;
	if (state.underline) stats.underlineChars += length;
	if (state.strike) stats.strikeChars += length;
	if (state.color) {
		stats.coloredChars += length;
		stats.colorValues.add(state.color);
	}
	if (state.fontSize) {
		stats.resizedChars += length;
		stats.fontSizeValues.add(state.fontSize);
	}
	if (state.largeFont) stats.largeFontChars += length;
}

function collectPresentationStats(node: Node, stats: PresentationStats, inherited = defaultPresentationState) {
	if (node.nodeType === Node.TEXT_NODE) {
		addTextStats(stats, inherited, node.textContent ?? "");
		return;
	}

	if (!(node instanceof HTMLElement)) {
		node.childNodes.forEach((child) => {
			collectPresentationStats(child, stats, inherited);
		});
		return;
	}

	const nextState = getElementPresentationState(node, inherited);
	const tag = node.tagName.toLowerCase();
	const textAlign = getStyleValue(node, "text-align") || node.getAttribute("align")?.trim().toLowerCase();

	if (tag === "ul" || tag === "ol") stats.listCount += 1;
	if (textAlign === "center" || textAlign === "right") stats.centeredOrRightBlocks += 1;

	node.childNodes.forEach((child) => {
		collectPresentationStats(child, stats, nextState);
	});
}

function percent(value: number, total: number) {
	if (!total) return 0;
	return Math.round((value / total) * 100);
}

function describeCoverage(label: string, chars: number, totalChars: number, details = "") {
	if (!chars) return "";
	return `${label}: ${percent(chars, totalChars)}% of body${details}`;
}

export function summarizeDraftPresentation(value: DraftEmail) {
	if (typeof DOMParser === "undefined" || !value.bodyHtml?.trim()) {
		return "Presentation: plain text or no rich-text styling detected.";
	}

	const doc = new DOMParser().parseFromString(value.bodyHtml, "text/html");
	const stats: PresentationStats = {
		totalChars: 0,
		boldChars: 0,
		boldSegments: 0,
		italicChars: 0,
		underlineChars: 0,
		strikeChars: 0,
		coloredChars: 0,
		colorValues: new Set(),
		resizedChars: 0,
		largeFontChars: 0,
		fontSizeValues: new Set(),
		centeredOrRightBlocks: 0,
		listCount: 0,
	};

	collectPresentationStats(doc.body, stats);

	const observations = [
		describeCoverage("bold emphasis", stats.boldChars, stats.totalChars, stats.boldSegments ? ` across about ${stats.boldSegments} segment(s)` : ""),
		describeCoverage("italic emphasis", stats.italicChars, stats.totalChars),
		describeCoverage("underlined text", stats.underlineChars, stats.totalChars),
		describeCoverage("strikethrough text", stats.strikeChars, stats.totalChars),
		describeCoverage("colored text", stats.coloredChars, stats.totalChars, stats.colorValues.size ? ` using ${stats.colorValues.size} color(s)` : ""),
		describeCoverage(
			"changed font size",
			stats.resizedChars,
			stats.totalChars,
			stats.fontSizeValues.size ? ` using ${stats.fontSizeValues.size} size setting(s)` : "",
		),
		describeCoverage("large font", stats.largeFontChars, stats.totalChars),
		stats.listCount ? `lists: ${stats.listCount} list block(s)` : "",
		stats.centeredOrRightBlocks ? `alignment: ${stats.centeredOrRightBlocks} centered/right-aligned block(s)` : "",
	].filter(Boolean);

	if (!observations.length) return "Presentation: plain text or no rich-text styling detected.";

	const concerns: string[] = [];
	if (percent(stats.boldChars, stats.totalChars) > 35 || stats.boldSegments > 6)
		concerns.push("bold appears widespread rather than limited emphasis");
	if (percent(stats.coloredChars, stats.totalChars) > 20 || stats.colorValues.size > 2) concerns.push("color use may be visually distracting");
	if (stats.fontSizeValues.size > 2 || percent(stats.largeFontChars, stats.totalChars) > 10)
		concerns.push("font-size changes may be excessive for an email body");
	if (percent(stats.underlineChars + stats.strikeChars, stats.totalChars) > 10)
		concerns.push("underline/strikethrough use may be inappropriate for normal email prose");
	if (stats.centeredOrRightBlocks > 1) concerns.push("multiple centered/right-aligned blocks may look unusual in a professional email");

	const overall = concerns.length
		? `Presentation concerns: ${concerns.join("; ")}.`
		: "Presentation appears restrained; formatting can be treated as likely intentional emphasis.";

	return `${overall} Details: ${observations.join("; ")}.`;
}

export function parseDraftFromMessage(text: string, noSubjectLabel: string): DraftEmail {
	const toMatch = text.match(/^To:\s*(.*)$/m);
	const subjectMatch = text.match(/^Subject:\s*(.*)$/m);
	const body = text.replace(/^To:[^\n]*\nSubject:[^\n]*\n\n?/, "").trim();
	return {
		to: toMatch?.[1]?.trim() ?? "",
		subject: subjectMatch?.[1]?.trim() ?? noSubjectLabel,
		body,
		bodyHtml: plainTextToDraftHtml(body),
	};
}
