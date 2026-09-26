export type MarkedTextPart = { type: "text" | "mark"; content: string };

export type MarkedTextParseResult =
	| { success: true; parts: MarkedTextPart[]; plainText: string; markCount: number }
	| { success: false; parts: MarkedTextPart[]; plainText: string; markCount: 0 };

/** Parse exact, attribute-free <mark> tags without interpreting any other text as HTML. */
export function parseMarkedText(value: string): MarkedTextParseResult {
	const parts: MarkedTextPart[] = [];
	const tagPattern = /<mark>|<\/mark>/g;
	let insideMark = false;
	let lastIndex = 0;
	let markCount = 0;
	let match: RegExpExecArray | null;

	while ((match = tagPattern.exec(value)) !== null) {
		const content = value.slice(lastIndex, match.index);
		if (content) parts.push({ type: insideMark ? "mark" : "text", content });

		if (match[0] === "<mark>") {
			if (insideMark) return invalidMarkedText(value);
			insideMark = true;
		} else {
			if (!insideMark || !content) return invalidMarkedText(value);
			insideMark = false;
			markCount += 1;
		}
		lastIndex = match.index + match[0].length;
	}

	if (insideMark) return invalidMarkedText(value);
	const trailing = value.slice(lastIndex);
	if (trailing) parts.push({ type: "text", content: trailing });

	return {
		success: true,
		parts,
		plainText: parts.map((part) => part.content).join(""),
		markCount,
	};
}

function invalidMarkedText(value: string): MarkedTextParseResult {
	return {
		success: false,
		parts: [{ type: "text", content: value.replace(/<\/?mark>/g, "") }],
		plainText: value.replace(/<\/?mark>/g, ""),
		markCount: 0,
	};
}
