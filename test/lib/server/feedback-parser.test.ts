import { describe, expect, it } from "vitest";
import { getPlainText, isFeedbackResultValid, parseAnnotationSpans, parseFeedbackXml, stripAllTags } from "$lib/server/feedback-parser";

describe("stripAllTags", () => {
	it("removes annotation and highlight tags, leaving content", () => {
		expect(stripAllTags("hello <grammar>world</grammar>")).toBe("hello world");
		expect(stripAllTags("<vocab>foo</vocab> bar")).toBe("foo bar");
		expect(stripAllTags("a <delete>bad</delete> idea")).toBe("a bad idea");
		expect(stripAllTags("use <highlight>this</highlight> word")).toBe("use this word");
	});

	it("handles text with no tags", () => {
		expect(stripAllTags("plain text")).toBe("plain text");
	});

	it("handles nested tags", () => {
		expect(stripAllTags("<grammar><vocab>nested</vocab></grammar>")).toBe("nested");
	});
});

describe("getPlainText", () => {
	it("returns text with all tags stripped", () => {
		expect(getPlainText("I <grammar>goed</grammar> to the <vocab>tienda</vocab>")).toBe("I goed to the tienda");
	});
});

describe("parseAnnotationSpans", () => {
	it("parses grammar and vocab spans with correct offsets", () => {
		const spans = parseAnnotationSpans("I <grammar>goed</grammar> to <vocab>tienda</vocab>");
		expect(spans).toHaveLength(2);
		expect(spans[0]).toEqual({ kind: "grammar", text: "goed", startOffset: 2 });
		expect(spans[1]).toEqual({ kind: "vocab", text: "tienda", startOffset: 10 });
	});

	it("parses delete spans", () => {
		const spans = parseAnnotationSpans("This is <delete>very</delete> good");
		expect(spans).toHaveLength(1);
		expect(spans[0]).toEqual({ kind: "delete", text: "very", startOffset: 8 });
	});

	it("returns empty array for text with no annotations", () => {
		expect(parseAnnotationSpans("plain text")).toEqual([]);
	});

	it("handles nested tags — inner tag content is kept as text", () => {
		const spans = parseAnnotationSpans("He <grammar><vocab>very big</vocab></grammar> said");
		expect(spans).toHaveLength(1);
		expect(spans[0].kind).toBe("grammar");
		expect(spans[0].text).toBe("very big");
	});

	it("handles multiple consecutive tags", () => {
		const spans = parseAnnotationSpans("<grammar>a</grammar> <vocab>b</vocab> <delete>c</delete>");
		expect(spans).toHaveLength(3);
		expect(spans[0].kind).toBe("grammar");
		expect(spans[1].kind).toBe("vocab");
		expect(spans[2].kind).toBe("delete");
	});
});

describe("parseFeedbackXml", () => {
	const validXml = `<feedback>
<message id="1">
<annotated>I <grammar>goed</grammar> to the <vocab>tienda</vocab> yesterday</annotated>
<comment>Good attempt! Use <highlight>tienda</highlight> correctly.</comment>
</message>
<message id="2">
<annotated>I bought <grammar>manzanas y platanos</grammar></annotated>
<comment>Wrong gender: <highlight>plátanos</highlight> is masculine.</comment>
</message>
<objectives>
<objective grade="A">Greet the shopkeeper</objective>
<objective grade="B">Ask about availability</objective>
</objectives>
<summary>Overall good with minor grammar issues.</summary>
</feedback>`;

	it("parses a complete feedback XML with 2 messages, 2 objectives, and summary", () => {
		const result = parseFeedbackXml(validXml);
		expect(result.annotations).toHaveLength(2);
		expect(result.objectives).toHaveLength(2);
		expect(result.summary).toBe("Overall good with minor grammar issues.");
	});

	it("extracts message IDs correctly", () => {
		const result = parseFeedbackXml(validXml);
		expect(result.annotations[0].messageId).toBe(1);
		expect(result.annotations[1].messageId).toBe(2);
	});

	it("extracts annotated text and parses spans", () => {
		const result = parseFeedbackXml(validXml);
		expect(result.annotations[0].annotatedText).toContain("<grammar>goed</grammar>");
		expect(result.annotations[0].spans).toHaveLength(2); // grammar + vocab
		expect(result.annotations[1].spans).toHaveLength(1);
	});

	it("extracts comments", () => {
		const result = parseFeedbackXml(validXml);
		expect(result.annotations[0].comment).toContain("Good attempt");
		expect(result.annotations[1].comment).toContain("Wrong gender");
	});

	it("extracts objectives with grades", () => {
		const result = parseFeedbackXml(validXml);
		expect(result.objectives[0]).toEqual({ text: "Greet the shopkeeper", grade: "A" });
		expect(result.objectives[1]).toEqual({ text: "Ask about availability", grade: "B" });
	});

	it("handles XML wrapped in markdown code fences", () => {
		const md = `\`\`\`xml\n${validXml}\n\`\`\``;
		const result = parseFeedbackXml(md);
		expect(result.annotations).toHaveLength(2);
		expect(result.summary).toBeTruthy();
	});

	it("handles XML with no <feedback> wrapper", () => {
		const bare = `<message id="1">
<annotated>Hello <grammar>word</grammar></annotated>
<comment>Nice!</comment>
</message>
<summary>Good job.</summary>`;
		const result = parseFeedbackXml(bare);
		expect(result.annotations).toHaveLength(1);
		expect(result.annotations[0].messageId).toBe(1);
		expect(result.summary).toBe("Good job.");
	});

	it("handles missing objectives gracefully", () => {
		const noObjectives = `<feedback>
<message id="1">
<annotated>Hello</annotated>
<comment>Good.</comment>
</message>
<summary>Fine.</summary>
</feedback>`;
		const result = parseFeedbackXml(noObjectives);
		expect(result.annotations).toHaveLength(1);
		expect(result.objectives).toEqual([]);
		expect(result.summary).toBe("Fine.");
	});

	it("handles missing objective grade (defaults to C)", () => {
		const xml = `<feedback>
<message id="1">
<annotated>Hello</annotated>
<comment>OK.</comment>
</message>
<objectives>
<objective>Some objective without grade</objective>
</objectives>
<summary>OK.</summary>
</feedback>`;
		const result = parseFeedbackXml(xml);
		expect(result.objectives[0].grade).toBe("C");
	});

	it("handles empty message annotated text", () => {
		const xml = `<feedback>
<message id="1">
<annotated></annotated>
<comment>Nothing to annotate.</comment>
</message>
<summary>Clean message.</summary>
</feedback>`;
		const result = parseFeedbackXml(xml);
		expect(result.annotations[0].annotatedText).toBe("");
		expect(result.annotations[0].spans).toEqual([]);
	});

	it("throws on oversized input", () => {
		const huge = `<feedback><message id="1"><annotated>${"x".repeat(100_001)}</annotated><comment>ok</comment></message><summary>ok</summary></feedback>`;
		expect(() => parseFeedbackXml(huge)).toThrow("Feedback XML too large");
	});

	it("accepts input at exactly the size limit", () => {
		const xml = `<feedback><message id="1"><annotated>Hello</annotated><comment>ok</comment></message><summary>ok</summary></feedback>`;
		expect(() => parseFeedbackXml(xml)).not.toThrow();
	});
});

describe("isFeedbackResultValid", () => {
	it("returns true for result with annotations and summary", () => {
		expect(
			isFeedbackResultValid({
				annotations: [{ messageId: 1, annotatedText: "text", spans: [], comment: "good" }],
				objectives: [],
				summary: "Great!",
			}),
		).toBe(true);
	});

	it("returns false when annotations empty", () => {
		expect(isFeedbackResultValid({ annotations: [], objectives: [], summary: "Great!" })).toBe(false);
	});

	it("returns false when summary empty", () => {
		expect(
			isFeedbackResultValid({
				annotations: [{ messageId: 1, annotatedText: "text", spans: [], comment: "good" }],
				objectives: [],
				summary: "",
			}),
		).toBe(false);
	});
});
