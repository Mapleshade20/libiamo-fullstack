import DOMPurify from "isomorphic-dompurify";
import { normalizeText } from "../../utils/messageUtils";
import type { ChatMessage } from "../chatMessages";
import type { DraftEmail, MailEmail, NormalizedMailEmail } from "./types";

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
	const sanitized = DOMPurify.sanitize(limited, {
		ALLOWED_TAGS: ["blockquote", "br", "div", "li", "ol", "p", "span", "ul"],
		ALLOWED_ATTR: ["align", "style"],
		FORBID_TAGS: ["script", "style"],
		ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z])/i,
	});

	return stripUnsupportedDraftStyles(sanitized).trim();
}

function stripUnsupportedDraftStyles(value: string) {
	return value.replace(/\sstyle="([^"]*)"/gi, (_match, rawStyle: string) => {
		const kept = rawStyle
			.split(";")
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => {
				const separatorIndex = part.indexOf(":");
				if (separatorIndex === -1) return "";
				const property = part.slice(0, separatorIndex).trim().toLowerCase();
				const styleValue = part.slice(separatorIndex + 1).trim();
				if (!["text-align", "margin-left", "padding-left"].includes(property)) return "";
				return `${property}: ${styleValue}`;
			})
			.filter(Boolean)
			.join("; ");

		return kept ? ` style="${kept}"` : "";
	});
}

type LayoutContext = {
	tag: string;
	align?: string;
	indent?: string;
	listType?: "ul" | "ol";
	nextIndex?: number;
	itemPrefix?: string;
};

function decodeHtmlEntities(value: string) {
	return value
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#039;/g, "'");
}

function getAttributeValue(attributes: string, name: string) {
	const match = attributes.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
	return match?.[1]?.trim() ?? "";
}

function getStyleProperty(attributes: string, property: string) {
	const style = getAttributeValue(attributes, "style");
	const parts = style.split(";").map((part) => part.trim());
	for (const part of parts) {
		const separatorIndex = part.indexOf(":");
		if (separatorIndex === -1) continue;
		const key = part.slice(0, separatorIndex).trim().toLowerCase();
		if (key === property) return part.slice(separatorIndex + 1).trim();
	}
	return "";
}

function tokenizeHtml(value: string) {
	const tokens: Array<{ tag?: string; text?: string }> = [];
	let index = 0;

	while (index < value.length) {
		const tagStart = value.indexOf("<", index);
		if (tagStart === -1) {
			tokens.push({ text: value.slice(index) });
			break;
		}

		if (tagStart > index) tokens.push({ text: value.slice(index, tagStart) });

		const tagEnd = value.indexOf(">", tagStart + 1);
		if (tagEnd === -1) {
			tokens.push({ text: value.slice(tagStart) });
			break;
		}

		tokens.push({ tag: value.slice(tagStart + 1, tagEnd) });
		index = tagEnd + 1;
	}

	return tokens;
}

function getTagName(tagToken: string) {
	let index = tagToken.startsWith("/") ? 1 : 0;
	while (index < tagToken.length && /\s/.test(tagToken[index])) index += 1;

	const start = index;
	while (index < tagToken.length && /[a-z0-9]/i.test(tagToken[index])) index += 1;
	return tagToken.slice(start, index).toLowerCase();
}

function getLayoutContext(tag: string, attributes: string, parent?: LayoutContext): LayoutContext {
	const align = getAttributeValue(attributes, "align") || getStyleProperty(attributes, "text-align") || parent?.align;
	const indent = getStyleProperty(attributes, "margin-left") || getStyleProperty(attributes, "padding-left") || parent?.indent;
	return { tag, align, indent };
}

function summarizeLayoutLine(text: string, contexts: LayoutContext[]) {
	const normalizedText = decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
	if (!normalizedText) return "";

	const listItem = [...contexts].reverse().find((context) => context.itemPrefix);
	const align = [...contexts].reverse().find((context) => context.align)?.align;
	const indent = [...contexts].reverse().find((context) => context.indent)?.indent;
	const inBlockquote = contexts.some((context) => context.tag === "blockquote");

	const markers = [];
	if (align && align !== "left" && align !== "start") markers.push(`align=${align}`);
	if (indent) markers.push(`indent=${indent}`);
	else if (inBlockquote) markers.push("indent=blockquote");

	const markerText = markers.length ? `[${markers.join(", ")}] ` : "";
	return `${listItem?.itemPrefix ?? ""}${markerText}${normalizedText}`;
}

export function summarizeMailBodyLayout(value: string | undefined, maxLength = mailBodyHtmlMaxLength) {
	const html = sanitizeDraftBodyHtml(value, maxLength);
	if (!html) return "";

	const lines: string[] = [];
	const contexts: LayoutContext[] = [];
	let buffer = "";
	const blockTags = new Set(["blockquote", "div", "li", "ol", "p", "ul"]);

	function flushLine() {
		const line = summarizeLayoutLine(buffer, contexts);
		if (line) lines.push(line);
		buffer = "";
	}

	for (const token of tokenizeHtml(html)) {
		if (token.text) {
			buffer += token.text;
			continue;
		}

		const tagToken = token.tag;
		if (tagToken === undefined) continue;
		const isClosing = tagToken.startsWith("/");
		const tag = getTagName(tagToken);
		if (!tag) continue;

		if (tag === "br") {
			flushLine();
			continue;
		}

		if (isClosing) {
			if (blockTags.has(tag)) flushLine();
			const index = contexts.map((context) => context.tag).lastIndexOf(tag);
			if (index !== -1) contexts.splice(index, 1);
			continue;
		}

		if (blockTags.has(tag) && buffer.trim()) flushLine();

		if (tag === "ul" || tag === "ol") {
			contexts.push({ tag, listType: tag, nextIndex: 1 });
			continue;
		}

		const parent = contexts.at(-1);
		if (tag === "li") {
			const listContext = [...contexts].reverse().find((context) => context.listType);
			const itemPrefix = listContext?.listType === "ol" ? `${listContext.nextIndex ?? 1}. ` : "- ";
			if (listContext?.listType === "ol") listContext.nextIndex = (listContext.nextIndex ?? 1) + 1;
			contexts.push({ ...getLayoutContext(tag, tagToken, parent), itemPrefix });
			continue;
		}

		if (tag === "blockquote" || tag === "div" || tag === "p" || tag === "span") {
			contexts.push(getLayoutContext(tag, tagToken, parent));
		}
	}

	flushLine();
	return lines.join("\n").slice(0, 3500);
}

function trimHorizontalWhitespace(value: string) {
	return value
		.split("\n")
		.map((line) => line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, ""))
		.join("\n");
}

export function normalizeMailBodySpacing(value: string) {
	const normalizedLines = trimHorizontalWhitespace(value.replace(/\r\n?/g, "\n")).split("\n");
	const compactedLines: string[] = [];
	let blankCount = 0;

	for (const line of normalizedLines) {
		if (line === "") {
			blankCount += 1;
			if (blankCount <= 1) compactedLines.push(line);
			continue;
		}

		blankCount = 0;
		compactedLines.push(line);
	}

	return compactedLines.join("\n").trim();
}

export function formatDraftMessage(value: DraftEmail, noSubjectLabel: string) {
	const subject = normalizeText(value.subject, noSubjectLabel);
	return `To: ${value.to.trim()}\nSubject: ${subject}\n\n${normalizeMailBodySpacing(value.body)}`;
}

function splitMailAddress(value: string) {
	const trimmed = value.trim();
	if (!trimmed.endsWith(">")) {
		return { name: trimmed || value, address: trimmed };
	}

	const angleStart = trimmed.lastIndexOf("<");
	if (angleStart === -1) return { name: trimmed || value, address: trimmed };

	const address = trimmed.slice(angleStart + 1, -1).trim();
	const rawName = trimmed.slice(0, angleStart).trim();
	const name = stripWrappingQuotes(rawName) || address;
	return { name, address };
}

function stripWrappingQuotes(value: string) {
	return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1).trim() : value;
}

export function normalizeMailEmails(emails: MailEmail[] | undefined, fallbackTime = ""): NormalizedMailEmail[] {
	return (Array.isArray(emails) ? emails : []).map((email, index) => {
		const from = splitMailAddress(email.from || "");
		const body = normalizeMailBodySpacing(email.body || "");
		return {
			...email,
			id: `inbox-${index}`,
			fromName: from.name,
			fromAddress: from.address,
			displayFrom: from.address && from.name !== from.address ? `${from.name} <${from.address}>` : from.name,
			preview: body,
			time: email.time || fallbackTime,
		};
	});
}

export function getMailBodyHtmlFromMessage(message: ChatMessage | null | undefined) {
	const metadata = message?.llmMetadata;
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
	const bodyHtml = (metadata as { mailBodyHtml?: unknown }).mailBodyHtml;
	return typeof bodyHtml === "string" ? sanitizeDraftBodyHtml(bodyHtml) : "";
}

export function parseDraftFromMessage(text: string, noSubjectLabel: string, bodyHtmlOverride = ""): DraftEmail {
	const lines = text.split("\n");
	const to = readHeaderLine(lines, "To:");
	const subject = readHeaderLine(lines, "Subject:");
	const bodyStart = lines[0]?.startsWith("To:") && lines[1]?.startsWith("Subject:") ? (lines[2] === "" ? 3 : 2) : 0;
	const body = normalizeMailBodySpacing(lines.slice(bodyStart).join("\n"));
	const bodyHtml = sanitizeDraftBodyHtml(bodyHtmlOverride);
	return {
		to,
		subject: subject || noSubjectLabel,
		body,
		bodyHtml: bodyHtml || plainTextToDraftHtml(body),
	};
}

function readHeaderLine(lines: string[], header: string) {
	const line = lines.find((candidate) => candidate.startsWith(header));
	return line ? line.slice(header.length).trim() : "";
}
