import { describe, expect, it } from "vitest";
import { getMailContact, getMailContactFromOpeningEmails } from "$lib/components/practice-ui/mail/userPool";

describe("mail userPool", () => {
	it("returns deterministic contacts for the same seed", () => {
		expect(getMailContact("task-123")).toEqual(getMailContact("task-123"));
	});

	it("returns a display value suitable for the readonly To field", () => {
		const contact = getMailContact(456);

		expect(contact.name.length).toBeGreaterThan(0);
		expect(contact.email).toContain("@");
		expect(contact.display).toBe(`${contact.name} <${contact.email}>`);
	});

	it("falls back to the mail seed for empty values", () => {
		expect(getMailContact("")).toEqual(getMailContact("mail"));
	});

	it("uses the first opening email sender as the Mail contact", () => {
		const fallback = getMailContact("task-123");

		expect(
			getMailContactFromOpeningEmails(
				[
					{ from: "", to: "learner@example.com", subject: "Ignored", body: "" },
					{ from: '"Maya Chen" <maya@example.com>', to: "learner@example.com", subject: "Update", body: "Hello" },
				],
				fallback,
			),
		).toEqual({
			name: "Maya Chen",
			email: "maya@example.com",
			display: "Maya Chen <maya@example.com>",
		});
	});

	it("falls back when opening emails do not include a sender", () => {
		const fallback = getMailContact("task-123");

		expect(getMailContactFromOpeningEmails([{ from: "", to: "learner@example.com", subject: "Update", body: "Hello" }], fallback)).toEqual(fallback);
		expect(getMailContactFromOpeningEmails(undefined, fallback)).toEqual(fallback);
	});

	it("handles plain email and plain name senders", () => {
		const fallback = getMailContact("task-123");

		expect(
			getMailContactFromOpeningEmails([{ from: "maya@example.com", to: "learner@example.com", subject: "Update", body: "Hello" }], fallback),
		).toEqual({
			name: "maya@example.com",
			email: "maya@example.com",
			display: "maya@example.com",
		});
		expect(getMailContactFromOpeningEmails([{ from: "Maya Chen", to: "learner@example.com", subject: "Update", body: "Hello" }], fallback)).toEqual({
			name: "Maya Chen",
			email: "",
			display: "Maya Chen",
		});
	});
});
