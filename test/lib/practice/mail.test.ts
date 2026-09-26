import { describe, expect, it } from "vitest";
import {
	formatMailAddress,
	formatMailMessage,
	parseMailAddress,
	parseMailMessage,
	replySubject,
	resolveMailCounterpart,
	seededContact,
	stripMailHeaders,
} from "$lib/practice/mail";

describe("mail wire format", () => {
	it("round-trips a draft through the stored header format", () => {
		const content = formatMailMessage({ to: "Maya <maya@x.example>", subject: "Plans", body: "Hi Maya,  \n\n\n\nSee you.\r\n" });

		expect(content).toBe("To: Maya <maya@x.example>\nSubject: Plans\n\nHi Maya,\n\nSee you.");
		expect(parseMailMessage(content)).toEqual({ to: "Maya <maya@x.example>", subject: "Plans", body: "Hi Maya,\n\nSee you." });
	});

	it("reads content without the header as a bare body", () => {
		expect(parseMailMessage("Just text")).toEqual({ to: "", subject: "", body: "Just text" });
	});

	it("drops header lines a model still writes before an agent reply body", () => {
		expect(stripMailHeaders("Subject: Re: Plans\nFrom: Maya\n\nSure!")).toBe("Sure!");
		expect(stripMailHeaders("Sure!\nSubject: kept in the body")).toBe("Sure!\nSubject: kept in the body");
	});

	it("prefixes a reply subject once", () => {
		expect(replySubject("Plans")).toBe("Re: Plans");
		expect(replySubject("re: RE: Plans")).toBe("Re: Plans");
		expect(replySubject("")).toBe("");
	});
});

describe("mail contacts", () => {
	it("parses and formats display addresses", () => {
		expect(parseMailAddress('"Maya Chen" <maya@x.example>')).toEqual({ name: "Maya Chen", address: "maya@x.example" });
		expect(parseMailAddress("maya@x.example")).toEqual({ name: "maya@x.example", address: "maya@x.example" });
		expect(formatMailAddress({ name: "Maya", address: "maya@x.example" })).toBe("Maya <maya@x.example>");
	});

	it("writes to the first opening sender, or a stable made-up contact", () => {
		expect(resolveMailCounterpart({ emails: [{ from: "Captain Shane <shane@charters.example>" }] }, 9).name).toBe("Captain Shane");
		expect(resolveMailCounterpart({}, 9)).toEqual(seededContact(9));
		expect(seededContact("task-1")).toEqual(seededContact("task-1"));
	});
});
