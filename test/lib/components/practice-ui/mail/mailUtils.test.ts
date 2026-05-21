// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
	appendPlainTextToDraftHtml,
	ensureReplySubject,
	formatDraftMessage,
	getMailBodyHtmlFromMessage,
	normalizeAgentSignature,
	normalizeMailBodySpacing,
	normalizeMailEmails,
	normalizeReplySubject,
	parseAgentMailReply,
	parseDraftFromMessage,
	plainTextToDraftHtml,
	sanitizeDraftBodyHtml,
	summarizeMailBodyLayout,
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
			expect(appendPlainTextToDraftHtml(undefined, "Hello")).toBe("<div>Hello</div>");
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
				'<div style="text-align: center; color: #d70015">Hello <strong>styled</strong> text</div><script>alert("x")</script>',
			);

			expect(result.body).toBe("Hello styled text");
			expect(result.bodyHtml).toBe('<div style="text-align: center">Hello styled text</div>');
		});

		it("parses drafts with missing headers or no blank body separator", () => {
			expect(parseDraftFromMessage("Body only", "(No Subject)")).toMatchObject({
				to: "",
				subject: "(No Subject)",
				body: "Body only",
			});
			expect(parseDraftFromMessage("To: Maya\nSubject: \nBody starts immediately", "(No Subject)")).toMatchObject({
				to: "Maya",
				subject: "(No Subject)",
				body: "Body starts immediately",
			});
		});
	});

	describe("agent reply cleanup", () => {
		it("extracts leading mail headers from agent replies", () => {
			expect(parseAgentMailReply("Subject: Updated timeline\nFrom: Maya\n\nThanks for the update.", "Fallback")).toEqual({
				subject: "Updated timeline",
				body: "Thanks for the update.",
				hasExplicitSubject: true,
			});
		});

		it("falls back to the previous subject when no explicit subject exists", () => {
			expect(parseAgentMailReply("Thanks for the update.", "Project update")).toEqual({
				subject: "Project update",
				body: "Thanks for the update.",
				hasExplicitSubject: false,
			});
		});

		it("normalizes repeated reply prefixes without forcing explicit new subjects into replies", () => {
			expect(normalizeReplySubject("Re: Re: Project update", "(No Subject)")).toBe("Re: Project update");
			expect(normalizeReplySubject("New timeline", "(No Subject)")).toBe("New timeline");
			expect(ensureReplySubject("Re: Re: Project update", "(No Subject)")).toBe("Re: Project update");
			expect(ensureReplySubject("Project update", "(No Subject)")).toBe("Re: Project update");
		});

		it("replaces MBTI-like signatures with the sender name", () => {
			expect(normalizeAgentSignature("Sounds good.\n\nBest,\nINTJ", "Maya")).toBe("Sounds good.\n\nBest,\nMaya");
			expect(normalizeAgentSignature("Thanks,\n\nENFP", "Maya")).toBe("Thanks,\n\nMaya");
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

		it("keeps mail layout html while removing unsafe and decorative markup", () => {
			expect(
				sanitizeDraftBodyHtml(
					'<div onclick="alert(1)" style="text-align: right; color: #d70015; font-size: 24px">Friday</div><blockquote style="margin-left: 40px; font-weight: bold">Thanks</blockquote><img src=x onerror=alert(1)><script>alert(1)</script>',
				),
			).toBe('<div style="text-align: right">Friday</div><blockquote style="margin-left: 40px">Thanks</blockquote>');
		});

		it("drops unsupported or malformed style declarations", () => {
			expect(sanitizeDraftBodyHtml('<div style="color: red; broken">Hello</div>')).toBe("<div>Hello</div>");
		});

		it("extracts sanitized mail body html from chat message metadata", () => {
			expect(
				getMailBodyHtmlFromMessage({
					id: "1",
					role: "user",
					text: "To: Maya\nSubject: Hi\n\nHello",
					timestamp: "10:00",
					authorName: "Learner",
					llmMetadata: { mailBodyHtml: '<div style="padding-left: 40px"><b>Hello</b><script>alert("x")</script></div>' },
				}),
			).toBe('<div style="padding-left: 40px">Hello</div>');
		});
	});

	describe("summarizeMailBodyLayout", () => {
		it("summarizes alignment, indentation, and list structure without raw html", () => {
			expect(
				summarizeMailBodyLayout(
					'<div style="text-align: center; color: #d70015">Hello</div><blockquote style="margin-left: 40px"><div>Thanks</div></blockquote><ol><li>First</li><li style="padding-left: 20px">Second</li></ol>',
				),
			).toBe("[align=center] Hello\n[indent=40px] Thanks\n1. First\n2. [indent=20px] Second");
		});

		it("handles br tags, inherited layout, unordered lists, and entity decoding", () => {
			expect(summarizeMailBodyLayout('<div style="text-align: right">Hello&nbsp;&amp;<br>bye</div><ul><li>One</li><li>Two</li></ul>')).toBe(
				"[align=right] Hello &\n[align=right] bye\n- One\n- Two",
			);
		});

		it("marks blockquote indentation when no explicit indent is present", () => {
			expect(summarizeMailBodyLayout("<blockquote>Please review this.</blockquote>")).toBe("[indent=blockquote] Please review this.");
		});

		it("summarizes plain text and gracefully treats an unfinished tag as text", () => {
			expect(summarizeMailBodyLayout("Plain text only")).toBe("Plain text only");
			expect(summarizeMailBodyLayout("<div>Hello <unfinished")).toBe("Hello");
		});
	});

	describe("normalizeMailEmails", () => {
		it("normalizes sender display data, preview, and fallback time", () => {
			expect(
				normalizeMailEmails(
					[{ from: '"Maya Chen" <maya@example.com>', to: "learner@example.com", subject: "Update", body: "Hello\n\n\nThanks" }],
					"Today",
				),
			).toEqual([
				{
					id: "inbox-0",
					from: '"Maya Chen" <maya@example.com>',
					to: "learner@example.com",
					subject: "Update",
					body: "Hello\n\n\nThanks",
					fromName: "Maya Chen",
					fromAddress: "maya@example.com",
					displayFrom: "Maya Chen <maya@example.com>",
					preview: "Hello\n\nThanks",
					time: "Today",
				},
			]);
		});

		it("returns an empty list for missing opening emails", () => {
			expect(normalizeMailEmails(undefined)).toEqual([]);
		});

		it("handles sender values without angle-bracket addresses", () => {
			expect(normalizeMailEmails([{ from: "maya@example.com", to: "learner@example.com", subject: "Hi", body: "" }])[0]).toMatchObject({
				fromName: "maya@example.com",
				fromAddress: "maya@example.com",
				displayFrom: "maya@example.com",
				time: "",
			});
		});

		it("handles unusual sender strings", () => {
			expect(normalizeMailEmails([{ from: "", to: "learner@example.com", subject: "Hi", body: "", time: "Now" }])[0]).toMatchObject({
				fromName: "",
				fromAddress: "",
				displayFrom: "",
				time: "Now",
			});
			expect(normalizeMailEmails([{ from: "maya>", to: "learner@example.com", subject: "Hi", body: "" }])[0]).toMatchObject({
				fromName: "maya>",
				fromAddress: "maya>",
			});
			expect(normalizeMailEmails([{ from: "<maya@example.com>", to: "learner@example.com", subject: "Hi", body: "" }])[0]).toMatchObject({
				fromName: "maya@example.com",
				displayFrom: "maya@example.com",
			});
		});
	});
});
