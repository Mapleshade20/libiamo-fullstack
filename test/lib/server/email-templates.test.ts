import { describe, expect, it } from "vitest";
import { emailVerificationHtml, resetPasswordHtml } from "$lib/server/email-templates";

describe("emailVerificationHtml", () => {
	it("returns an HTML string containing the user email", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("learner@example.com");
	});

	it("returns an HTML string containing the verification URL", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("https://example.com/verify");
	});

	it("includes the correct header title", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("Verify Your Email");
	});

	it("includes the correct header icon", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("🎉");
	});

	it("includes the correct header subtitle", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("Libiamo — Language Learning Platform");
	});

	it("includes the correct greeting", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("Welcome to Libiamo!");
	});

	it("includes the correct button text", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("Verify Email Address");
	});

	it("wraps email in strong tag", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("<strong>learner@example.com</strong>");
	});

	it("includes expiry mention of 24 hours", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("24 hours");
	});

	it("produces a complete HTML document", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain('<html lang="en">');
		expect(html).toContain("</html>");
	});

	it("includes the URL as the button href", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain('href="https://example.com/verify"');
	});

	it("includes fallback link text", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("If the button doesn't work");
	});

	it("includes Libiamo footer", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("Libiamo");
		expect(html).toContain("https://libiamo.net");
	});
});

describe("resetPasswordHtml", () => {
	it("returns an HTML string containing the user email", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("user@test.com");
	});

	it("returns an HTML string containing the reset URL", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("https://example.com/reset");
	});

	it("includes the correct header title", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("Reset Your Password");
	});

	it("includes the correct header icon", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("🔐");
	});

	it("includes the correct header subtitle", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("Libiamo — Account Security");
	});

	it("includes the correct greeting", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("Forgot your password?");
	});

	it("includes the correct button text", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("Reset Password");
	});

	it("wraps email in strong tag", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("<strong>user@test.com</strong>");
	});

	it("includes expiry mention of 1 hour", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("1 hour");
	});

	it("produces a complete HTML document", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain('<html lang="en">');
		expect(html).toContain("</html>");
	});

	it("includes the URL as the button href", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain('href="https://example.com/reset"');
	});

	it("includes fallback link text", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("If the button doesn't work");
	});

	it("includes Libiamo footer", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("Libiamo");
		expect(html).toContain("https://libiamo.net");
	});
});

describe("shared template structure", () => {
	it("emailVerificationHtml and resetPasswordHtml produce different output for same inputs", () => {
		const email = "same@example.com";
		const url = "https://example.com/link";
		const verify = emailVerificationHtml(email, url);
		const reset = resetPasswordHtml(email, url);

		expect(verify).not.toBe(reset);
	});

	it("emailVerificationHtml produces different output for different emails", () => {
		const htmlA = emailVerificationHtml("a@example.com", "https://example.com/verify");
		const htmlB = emailVerificationHtml("b@example.com", "https://example.com/verify");

		expect(htmlA).not.toBe(htmlB);
	});

	it("resetPasswordHtml produces different output for different URLs", () => {
		const htmlA = resetPasswordHtml("user@example.com", "https://example.com/reset-a");
		const htmlB = resetPasswordHtml("user@example.com", "https://example.com/reset-b");

		expect(htmlA).not.toBe(htmlB);
	});

	it("both templates contain inline styles", () => {
		const verify = emailVerificationHtml("user@example.com", "https://example.com/verify");
		const reset = resetPasswordHtml("user@example.com", "https://example.com/reset");

		expect(verify).toContain("style=");
		expect(reset).toContain("style=");
	});

	it("both templates contain the viewport meta tag", () => {
		const verify = emailVerificationHtml("user@example.com", "https://example.com/verify");
		const reset = resetPasswordHtml("user@example.com", "https://example.com/reset");

		expect(verify).toContain('name="viewport"');
		expect(reset).toContain('name="viewport"');
	});

	it("handles special characters in email gracefully", () => {
		const html = emailVerificationHtml("user+special@example.com", "https://example.com/verify");
		expect(html).toContain("user+special@example.com");
	});

	it("handles long URLs in the template", () => {
		const longUrl = "https://example.com/verify?token=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz";
		const html = resetPasswordHtml("user@example.com", longUrl);
		expect(html).toContain(longUrl);
	});
});
