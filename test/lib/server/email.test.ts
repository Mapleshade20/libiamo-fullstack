import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateTransport, mockSendMail, mockEnv } = vi.hoisted(() => {
	const mockSendMail = vi.fn();
	const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
	const mockEnv = {
		SMTP_HOST: "smtp.example.com",
		SMTP_PORT: "587",
		SMTP_SECURE: "false",
		SMTP_USER: "smtp-user",
		SMTP_PASS: "smtp-pass",
		SMTP_FROM: "noreply@example.com",
	};
	return { mockCreateTransport, mockSendMail, mockEnv };
});

vi.mock("nodemailer", () => ({
	default: {
		createTransport: mockCreateTransport,
	},
}));

vi.mock("$env/dynamic/private", () => ({
	env: mockEnv,
}));

import { sendEmail } from "$lib/server/auth/email";

describe("sendEmail", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEnv.SMTP_HOST = "smtp.example.com";
		mockEnv.SMTP_USER = "smtp-user";
		mockEnv.SMTP_PASS = "smtp-pass";
		mockEnv.SMTP_PORT = "587";
		mockEnv.SMTP_SECURE = "false";
		mockEnv.SMTP_FROM = "noreply@example.com";
	});

	it("logs and returns when SMTP is not configured", async () => {
		mockEnv.SMTP_HOST = "";
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		await sendEmail({
			to: "user@example.com",
			subject: "Verify",
			text: "Please verify",
		});

		expect(mockCreateTransport).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith("[email] SMTP not configured. Would send email:");
		expect(logSpy).toHaveBeenCalledWith("  To: user@example.com");
		expect(logSpy).toHaveBeenCalledWith("  Subject: Verify");
		expect(logSpy).toHaveBeenCalledWith("  Body: Please verify");
	});

	it("creates transporter and sends mail when SMTP is configured", async () => {
		await sendEmail({
			to: "user@example.com",
			subject: "Reset password",
			text: "Reset link",
			html: "<p>Reset link</p>",
		});

		expect(mockCreateTransport).toHaveBeenCalledWith({
			host: "smtp.example.com",
			port: 587,
			secure: false,
			auth: {
				user: "smtp-user",
				pass: "smtp-pass",
			},
		});
		expect(mockSendMail).toHaveBeenCalledWith({
			from: "noreply@example.com",
			to: "user@example.com",
			subject: "Reset password",
			text: "Reset link",
			html: "<p>Reset link</p>",
		});
	});

	it("uses default port and secure=true when configured", async () => {
		mockEnv.SMTP_PORT = "";
		mockEnv.SMTP_SECURE = "true";

		await sendEmail({
			to: "secure@example.com",
			subject: "Secure",
			text: "Secure transport",
		});

		expect(mockCreateTransport).toHaveBeenCalledWith({
			host: "smtp.example.com",
			port: 587,
			secure: true,
			auth: {
				user: "smtp-user",
				pass: "smtp-pass",
			},
		});
	});
});

import { emailVerificationHtml, resetPasswordHtml } from "$lib/server/auth/email";

describe("emailVerificationHtml", () => {
	it("returns an HTML string containing the user email", () => {
		const html = emailVerificationHtml("learner@example.com", "https://example.com/verify");
		expect(html).toContain("learner@example.com");
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
});

describe("resetPasswordHtml", () => {
	it("returns an HTML string containing the user email", () => {
		const html = resetPasswordHtml("user@test.com", "https://example.com/reset");
		expect(html).toContain("user@test.com");
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
