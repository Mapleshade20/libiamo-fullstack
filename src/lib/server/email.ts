import nodemailer from "nodemailer";
import { env } from "$env/dynamic/private";

function createTransporter() {
	if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
		return null;
	}
	return nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: Number(env.SMTP_PORT || "587"),
		secure: env.SMTP_SECURE === "true",
		auth: {
			user: env.SMTP_USER,
			pass: env.SMTP_PASS,
		},
	});
}

const BASE_STYLES = `
  margin: 0;
  padding: 0;
  background-color: #f4f4f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
`;

const CONTAINER_STYLES = `
  max-width: 560px;
  margin: 40px auto;
  background-color: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
`;

const HEADER_STYLES = `
  background: linear-gradient(135deg, #f97316 0%, #f59e0b 50%, #facc15 100%);
  padding: 40px 40px 32px;
  text-align: center;
`;

const HEADER_ICON_STYLES = `
  font-size: 48px;
  margin-bottom: 8px;
`;

const HEADER_TITLE_STYLES = `
  color: #ffffff;
  font-size: 24px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.3px;
`;

const HEADER_SUBTITLE_STYLES = `
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: 400;
  margin: 4px 0 0;
`;

const BODY_STYLES = `
  padding: 40px;
`;

const GREETING_STYLES = `
  font-size: 18px;
  font-weight: 600;
  color: #18181b;
  margin: 0 0 16px;
`;

const MESSAGE_STYLES = `
  font-size: 15px;
  line-height: 1.6;
  color: #52525b;
  margin: 0 0 32px;
`;

const BUTTON_WRAPPER_STYLES = `
  text-align: center;
  margin: 0 0 32px;
`;

const BUTTON_STYLES = `
  display: inline-block;
  background: linear-gradient(135deg, #f97316, #f59e0b);
  color: #ffffff !important;
  text-decoration: none;
  font-size: 15px;
  font-weight: 600;
  padding: 14px 36px;
  border-radius: 10px;
  letter-spacing: 0.2px;
`;

const FALLBACK_STYLES = `
  font-size: 13px;
  color: #a1a1aa;
  text-align: center;
  margin: 0 0 8px;
  line-height: 1.5;
`;

const FALLBACK_LINK_STYLES = `
  color: #f59e0b;
  word-break: break-all;
`;

const DIVIDER_STYLES = `
  border: none;
  border-top: 1px solid #f4f4f5;
  margin: 0;
`;

const FOOTER_STYLES = `
  padding: 24px 40px;
  text-align: center;
`;

const FOOTER_TEXT_STYLES = `
  font-size: 13px;
  color: #a1a1aa;
  margin: 0;
  line-height: 1.5;
`;

const FOOTER_LINK_STYLES = `
  color: #f59e0b;
  text-decoration: none;
`;

function wrapContent(
	headerIcon: string,
	headerTitle: string,
	headerSubtitle: string,
	greeting: string,
	message: string,
	buttonText: string,
	buttonUrl: string,
): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
</head>
<body style="${BASE_STYLES}">
  <div style="${CONTAINER_STYLES}">
    <!-- Header -->
    <div style="${HEADER_STYLES}">
      <div style="${HEADER_ICON_STYLES}">${headerIcon}</div>
      <h1 style="${HEADER_TITLE_STYLES}">${headerTitle}</h1>
      <p style="${HEADER_SUBTITLE_STYLES}">${headerSubtitle}</p>
    </div>

    <!-- Body -->
    <div style="${BODY_STYLES}">
      <p style="${GREETING_STYLES}">${greeting}</p>
      <p style="${MESSAGE_STYLES}">${message}</p>

      <!-- CTA Button -->
      <div style="${BUTTON_WRAPPER_STYLES}">
        <a href="${buttonUrl}" target="_blank" style="${BUTTON_STYLES}">${buttonText}</a>
      </div>

      <!-- Fallback link -->
      <p style="${FALLBACK_STYLES}">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="${buttonUrl}" style="${FALLBACK_LINK_STYLES}">${buttonUrl}</a>
      </p>
    </div>

    <hr style="${DIVIDER_STYLES}" />

    <!-- Footer -->
    <div style="${FOOTER_STYLES}">
      <p style="${FOOTER_TEXT_STYLES}">
        This email was sent by <a href="https://libiamo.net" style="${FOOTER_LINK_STYLES}">Libiamo</a>.<br>
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export function emailVerificationHtml(userEmail: string, url: string): string {
	return wrapContent(
		"🎉",
		"Verify Your Email",
		"Libiamo — Language Learning Platform",
		"Welcome to Libiamo!",
		`We're excited to have you on board! Please verify your email address <strong>${userEmail}</strong> to get started with your language learning journey. This link will expire in 1 hour.`,
		"Verify Email Address",
		url,
	);
}

export function resetPasswordHtml(userEmail: string, url: string): string {
	return wrapContent(
		"🔐",
		"Reset Your Password",
		"Libiamo — Account Security",
		"Forgot your password?",
		`No worries — it happens to the best of us! Click the button below to set a new password for <strong>${userEmail}</strong>. This link will expire in 1 hour.`,
		"Reset Password",
		url,
	);
}

export async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html?: string }): Promise<void> {
	const transporter = createTransporter();
	if (!transporter) {
		console.log("[email] SMTP not configured. Would send email:");
		console.log(`  To: ${to}`);
		console.log(`  Subject: ${subject}`);
		console.log(`  Body: ${text}`);
		return;
	}
	await transporter.sendMail({
		from: env.SMTP_FROM,
		to,
		subject,
		text,
		html,
	});
}
