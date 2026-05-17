// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	appendPlainTextToDraftHtml,
	formatDraftMessage,
	getMailBodyHtmlFromMessage,
	normalizeMailBodySpacing,
	parseDraftFromMessage,
	plainTextToDraftHtml,
	sanitizeDraftBodyHtml,
	summarizeDraftPresentation,
} from "$lib/components/practice-ui/mail/mailUtils";

describe("mailUtils", () => {
	describe("plainTextToDraftHtml", () => {
		it("escapes text and preserves blank lines as editor divs", () => {
			expect(plainTextToDraftHtml("Hello <Maya>\n\nThanks & bye")).toBe("<div>Hello &lt;Maya&gt;</div><div><br></div><div>Thanks &amp; bye</div>");
		});

		it("returns an empty string for empty input", () => {
			expect(plainTextToDraftHtml("")).toBe("");
		});
	});

	describe("appendPlainTextToDraftHtml", () => {
		it("returns new html when there is no existing html", () => {
			expect(appendPlainTextToDraftHtml("   ", "Hello")).toBe("<div>Hello</div>");
		});

		it("can append with or without a separating blank line", () => {
			expect(appendPlainTextToDraftHtml("<div>Hello</div>", "Thanks")).toBe("<div>Hello</div><div><br></div><div>Thanks</div>");
			expect(appendPlainTextToDraftHtml("<div>Hello</div>", "Thanks", false)).toBe("<div>Hello</div><div>Thanks</div>");
		});
	});

	describe("normalizeMailBodySpacing", () => {
		it("normalizes platform line endings and collapses excessive blank lines", () => {
			expect(normalizeMailBodySpacing("  Hello  \r\n\r\n\r\n  Maya\n\n\nThanks  ")).toBe("Hello\n\nMaya\n\nThanks");
		});
	});

	describe("format and parse draft messages", () => {
		it("formats mail with normalized body spacing and subject fallback", () => {
			expect(
				formatDraftMessage(
					{
						to: " Maya Chen <maya@example.com> ",
						subject: "   ",
						body: "Hello\n\n\nThanks",
					},
					"(No Subject)",
				),
			).toBe("To: Maya Chen <maya@example.com>\nSubject: (No Subject)\n\nHello\n\nThanks");
		});

		it("parses sent message text back into a draft", () => {
			const result = parseDraftFromMessage("To: Maya\nSubject: Update\n\nHello\n\nThanks", "(No Subject)");

			expect(result).toEqual({
				to: "Maya",
				subject: "Update",
				body: "Hello\n\nThanks",
				bodyHtml: "<div>Hello</div><div><br></div><div>Thanks</div>",
			});
		});

		it("uses sanitized persisted body html when parsing a sent message", () => {
			const result = parseDraftFromMessage(
				"To: Maya\nSubject: Update\n\nHello styled text",
				"(No Subject)",
				'<div>Hello <strong style="color: #d70015">styled</strong> text</div><script>alert("x")</script>',
			);

			expect(result.body).toBe("Hello styled text");
			expect(result.bodyHtml).toBe('<div>Hello <strong style="color: #d70015">styled</strong> text</div>');
		});
	});

	describe("sanitizeDraftBodyHtml", () => {
		it("returns an empty string when there is no body html", () => {
			expect(sanitizeDraftBodyHtml(undefined)).toBe("");
			expect(getMailBodyHtmlFromMessage(null)).toBe("");
			expect(
				getMailBodyHtmlFromMessage({
					id: "1",
					role: "user",
					text: "To: Maya\nSubject: Hi\n\nHello",
					timestamp: "10:00",
					authorName: "Learner",
					llmMetadata: { mailBodyHtml: 123 },
				}),
			).toBe("");
		});

		it("keeps mail formatting tags while removing unsafe markup", () => {
			expect(
				sanitizeDraftBodyHtml(
					'<div onclick="alert(1)"><font color="#d70015" size="5">Friday</font><img src=x onerror=alert(1)><script>alert(1)</script></div>',
				),
			).toBe('<div><font color="#d70015" size="5">Friday</font></div>');
		});

		it("extracts sanitized mail body html from chat message metadata", () => {
			expect(
				getMailBodyHtmlFromMessage({
					id: "1",
					role: "user",
					text: "To: Maya\nSubject: Hi\n\nHello",
					timestamp: "10:00",
					authorName: "Learner",
					llmMetadata: { mailBodyHtml: '<div><b>Hello</b><script>alert("x")</script></div>' },
				}),
			).toBe("<div><b>Hello</b></div>");
		});
	});

	describe("summarizeDraftPresentation", () => {
		it("returns a plain-text note when there is no rich body html", () => {
			expect(summarizeDraftPresentation({ to: "Maya", subject: "Hi", body: "Hello" })).toBe(
				"Presentation: plain text or no rich-text styling detected.",
			);
		});

		it("returns a plain-text note when body html renders the same as plain body", () => {
			expect(
				summarizeDraftPresentation({
					to: "Maya",
					subject: "Hi",
					body: "Hello",
					bodyHtml: "<div>Hello</div>",
				}),
			).toBe("Presentation: plain text or no rich-text styling detected.");
		});

		it("marks rich text styling without changing the student's words", () => {
			const result = summarizeDraftPresentation({
				to: "Maya",
				subject: "Deadline",
				body: "Please reply by Friday.\nThanks",
				bodyHtml: '<div>Please reply by <b>Friday</b>.</div><div style="text-align: center"><font color="#d70015" size="5">Thanks</font></div>',
			});

			expect(result).toContain("Style markup rules");
			expect(result).toContain("Marked email body:");
			expect(result).toContain("**Friday**");
			expect(result).toContain("[align=center][size=5][color=#d70015]Thanks[/color][/size][/align]");
		});

		it("marks list items and inline text decorations", () => {
			const result = summarizeDraftPresentation({
				to: "Maya",
				subject: "Checklist",
				body: "First item\nSecond item",
				bodyHtml: "<ul><li><i>First item</i></li><li><u><s>Second item</s></u></li></ul>",
			});

			expect(result).toContain("- _First item_");
			expect(result).toContain("- [s][u]Second item[/u][/s]");
		});

		it("ignores unsupported html nodes while reading rich text markers", () => {
			const result = summarizeDraftPresentation({
				to: "Maya",
				subject: "Hi",
				body: "Hello",
				bodyHtml: "<!-- editor marker --><div><b>Hello</b></div>",
			});

			expect(result).toContain("**Hello**");
		});
	});
});
