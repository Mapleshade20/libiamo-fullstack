import type { TranslationDiffPart } from "$lib/translation-evaluation/types";

export type TranslationDiffParseResult = { success: true; parts: TranslationDiffPart[] } | { success: false; error: string };

class RestrictedDiffParser {
	private index = 0;

	constructor(private readonly input: string) {}

	parse(): TranslationDiffPart[] {
		if (!this.input) throw new Error("Diff must not be empty.");
		const parts: TranslationDiffPart[] = [];

		while (this.index < this.input.length) {
			if (this.consume("<delete>")) {
				parts.push({ type: "delete", text: this.readOperationText("</delete>") });
			} else if (this.consume("<add>")) {
				parts.push({ type: "add", text: this.readOperationText("</add>") });
			} else if (this.consume("<replace>")) {
				parts.push(this.readReplace());
			} else if (this.input[this.index] === "<") {
				throw new Error(`Unknown or misplaced tag at offset ${this.index}.`);
			} else {
				const text = this.readTextUntilTag();
				if (text) this.appendUnchanged(parts, text);
			}
		}

		if (parts.length === 0) throw new Error("Diff must contain text or an operation.");
		return parts;
	}

	private readReplace(): TranslationDiffPart {
		this.expect("<from>");
		const from = this.readOperationText("</from>", true);
		this.expect("<to>");
		const to = this.readOperationText("</to>", true);
		this.expect("</replace>");
		if (!from && !to) throw new Error("A replace operation must contain from or to text.");
		return { type: "replace", from, to };
	}

	private readOperationText(closingTag: string, allowEmpty = false): string {
		const closingIndex = this.input.indexOf(closingTag, this.index);
		if (closingIndex === -1) throw new Error(`Missing ${closingTag}.`);
		const raw = this.input.slice(this.index, closingIndex);
		if (!raw && !allowEmpty) throw new Error(`Operation before ${closingTag} must not be empty.`);
		if (raw.includes("<")) throw new Error(`Nested or unknown tag inside operation at offset ${this.index}.`);
		this.index = closingIndex + closingTag.length;
		return decodeText(raw, this.index - closingTag.length - raw.length);
	}

	private readTextUntilTag(): string {
		const nextTag = this.input.indexOf("<", this.index);
		const end = nextTag === -1 ? this.input.length : nextTag;
		const start = this.index;
		this.index = end;
		return decodeText(this.input.slice(start, end), start);
	}

	private appendUnchanged(parts: TranslationDiffPart[], text: string): void {
		const previous = parts.at(-1);
		if (previous?.type === "unchanged") previous.text += text;
		else parts.push({ type: "unchanged", text });
	}

	private consume(token: string): boolean {
		if (!this.input.startsWith(token, this.index)) return false;
		this.index += token.length;
		return true;
	}

	private expect(token: string): void {
		if (!this.consume(token)) throw new Error(`Expected ${token} at offset ${this.index}.`);
	}
}

function decodeText(raw: string, offset: number): string {
	let decoded = "";
	for (let index = 0; index < raw.length; ) {
		const character = raw[index];
		if (character === ">") throw new Error(`Literal > must be escaped as &gt; at offset ${offset + index}.`);
		if (character !== "&") {
			decoded += character;
			index++;
			continue;
		}

		const entity = (["&amp;", "&lt;", "&gt;"] as const).find((candidate) => raw.startsWith(candidate, index));
		if (!entity) throw new Error(`Unknown or unescaped entity at offset ${offset + index}.`);
		decoded += { "&amp;": "&", "&lt;": "<", "&gt;": ">" }[entity];
		index += entity.length;
	}
	return decoded;
}

export function parseTranslationDiff(input: string): TranslationDiffParseResult {
	try {
		return { success: true, parts: new RestrictedDiffParser(input).parse() };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
}
