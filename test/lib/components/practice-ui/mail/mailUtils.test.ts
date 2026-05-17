// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	formatDraftMessage,
	normalizeMailBodySpacing,
	parseDraftFromMessage,
	plainTextToDraftHtml,
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
	});

	describe("summarizeDraftPresentation", () => {
		it("returns a plain-text note when there is no rich body html", () => {
			expect(summarizeDraftPresentation({ to: "Maya", subject: "Hi", body: "Hello" })).toBe(
				"Presentation: plain text or no rich-text styling detected.",
			);
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
	});
});
