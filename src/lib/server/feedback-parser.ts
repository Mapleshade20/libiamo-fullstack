/**
 * Parser for the LLM's XML-formatted feedback response.
 *
 * Expected format:
 * <feedback>
 *   <message id="1">
 *     <annotated>I <grammar>goed</grammar> to the <vocab>tienda</vocab> yesterday</annotated>
 *     <comment>Good attempt! The past tense of "go" is "went". <highlight>tienda</highlight> is correct for "store".</comment>
 *   </message>
 *   ...
 *   <objectives>
 *     <objective grade="A">Greet the shopkeeper appropriately</objective>
 *     <objective grade="B">Ask about product availability</objective>
 *   </objectives>
 *   <summary>Overall good performance with minor grammar issues...</summary>
 * </feedback>
 */

import type { AnnotationKind, AnnotationSpan, FeedbackResult, MessageAnnotation, ObjectiveGrade } from "$lib/feedback-types";

// ── XML extraction helpers ───────────────────────────────────────────

function extractTagContent(xml: string, tag: string): string | null {
	const openTag = `<${tag}`;
	const closeTag = `</${tag}>`;
	const startIdx = xml.indexOf(openTag);
	if (startIdx === -1) return null;

	// Find the end of the opening tag (handle attributes)
	const tagEndIdx = xml.indexOf(">", startIdx + openTag.length);
	if (tagEndIdx === -1) return null;

	const contentStart = tagEndIdx + 1;
	const endIdx = xml.indexOf(closeTag, contentStart);
	if (endIdx === -1) return null;

	return xml.slice(contentStart, endIdx);
}

function extractAllTagsWithAttr(xml: string, tag: string): Array<{ attrs: Record<string, string>; content: string }> {
	const results: Array<{ attrs: Record<string, string>; content: string }> = [];
	const openTag = `<${tag}`;
	const closeTag = `</${tag}>`;
	let searchFrom = 0;

	while (true) {
		const startIdx = xml.indexOf(openTag, searchFrom);
		if (startIdx === -1) break;

		const tagEndIdx = xml.indexOf(">", startIdx + openTag.length);
		if (tagEndIdx === -1) break;

		// Parse attributes
		const attrStr = xml.slice(startIdx + openTag.length, tagEndIdx).trim();
		const attrs: Record<string, string> = {};
		const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
		let attrMatch: RegExpExecArray | null;
		while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
			attrs[attrMatch[1]] = attrMatch[2];
		}

		const contentStart = tagEndIdx + 1;
		const endIdx = xml.indexOf(closeTag, contentStart);
		if (endIdx === -1) break;

		results.push({ attrs, content: xml.slice(contentStart, endIdx) });
		searchFrom = endIdx + closeTag.length;
	}

	return results;
}

// ── Annotation span parsing ──────────────────────────────────────────

const ANNOTATION_TAGS: AnnotationKind[] = ["grammar", "vocab", "delete"];

export function parseAnnotationSpans(annotatedText: string): AnnotationSpan[] {
	const spans: AnnotationSpan[] = [];
	const tagPattern = /<(grammar|vocab|delete)>([\s\S]*?)<\/\1>/g;
	let match: RegExpExecArray | null;

	// We need to track position in the "plain text" version
	let plainOffset = 0;
	let lastIndex = 0;

	while ((match = tagPattern.exec(annotatedText)) !== null) {
		// Add the plain text before this tag
		const textBefore = annotatedText.slice(lastIndex, match.index);
		plainOffset += stripAllTags(textBefore).length;

		const kind = match[1] as AnnotationKind;
		const innerText = match[2];
		const plainInner = stripAllTags(innerText);

		spans.push({
			kind,
			text: plainInner,
			startOffset: plainOffset,
		});

		plainOffset += plainInner.length;
		lastIndex = match.index + match[0].length;
	}

	return spans;
}

/** Strip all XML-like tags from text, leaving only content */
export function stripAllTags(text: string): string {
	return text.replace(/<\/?(?:grammar|vocab|delete|highlight)>/g, "");
}

/** Get plain text from annotated text (for display comparison) */
export function getPlainText(annotatedText: string): string {
	return stripAllTags(annotatedText);
}

// ── Main parser ──────────────────────────────────────────────────────

export function parseFeedbackXml(xmlResponse: string): FeedbackResult {
	// Strip markdown fences if present
	let xml = xmlResponse.trim();
	xml = xml.replace(/^```(?:xml)?\s*/i, "").replace(/\s*```$/i, "");

	// Extract feedback content (may or may not have wrapper)
	const feedbackContent = extractTagContent(xml, "feedback") ?? xml;

	// Parse message annotations
	const messageBlocks = extractAllTagsWithAttr(feedbackContent, "message");
	const annotations: MessageAnnotation[] = messageBlocks.map((block) => {
		const messageId = Number.parseInt(block.attrs.id ?? "0", 10);
		const annotatedText = extractTagContent(block.content, "annotated")?.trim() ?? "";
		const comment = extractTagContent(block.content, "comment")?.trim() ?? "";
		const spans = parseAnnotationSpans(annotatedText);

		return {
			messageId,
			annotatedText,
			spans,
			comment,
		};
	});

	// Parse objectives
	const objectivesBlock = extractTagContent(feedbackContent, "objectives") ?? "";
	const objectiveEntries = extractAllTagsWithAttr(objectivesBlock, "objective");
	const objectives: ObjectiveGrade[] = objectiveEntries.map((entry) => ({
		text: entry.content.trim(),
		grade: (entry.attrs.grade?.toUpperCase() ?? "C") as "A" | "B" | "C",
	}));

	// Parse summary
	const summary = extractTagContent(feedbackContent, "summary")?.trim() ?? "";

	return { annotations, objectives, summary };
}

// ── Validation ───────────────────────────────────────────────────────

export function isFeedbackResultValid(result: FeedbackResult): boolean {
	return result.annotations.length > 0 && result.summary.length > 0;
}
