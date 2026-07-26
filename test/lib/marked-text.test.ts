import { describe, expect, it } from "vitest";
import { parseMarkedText } from "$lib/marked-text";

describe("parseMarkedText", () => {
	it("splits exact semantic mark tags without interpreting other text as HTML", () => {
		expect(parseMarkedText("Learn <mark>this phrase</mark>, not <em>HTML</em>.")).toEqual({
			success: true,
			parts: [
				{ type: "text", content: "Learn " },
				{ type: "mark", content: "this phrase" },
				{ type: "text", content: ", not <em>HTML</em>." },
			],
			plainText: "Learn this phrase, not <em>HTML</em>.",
			markCount: 1,
		});
	});

	it.each([
		"<mark></mark>",
		"<mark>open",
		"close</mark>",
		"<mark>outer <mark>inner</mark></mark>",
	])("rejects malformed mark structure: %s", (value) => {
		expect(parseMarkedText(value).success).toBe(false);
	});
});
