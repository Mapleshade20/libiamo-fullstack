import { describe, expect, it } from "vitest";
import { getMailContact } from "$lib/components/practice-ui/mail/userPool";

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
});
