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

import { sendEmail } from "../../../src/lib/server/email";

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
