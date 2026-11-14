import nodemailer from "nodemailer";
import { dev } from "$app/env";
import { ORIGIN, SMTP_FROM, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_SECURE, SMTP_USER } from "$app/env/private";

/*
 * The account mails. English for now: the catalog has no mail strings yet, and at sign-up there is no account language
 * to read. Calm and plain, as the app is: paper, a serif line, one link.
 */

export type Mail = { to: string; subject: string; text: string; html: string };

/* Mail is sent only when the server, the account and its password are all set. Anything less (a development .env
   that names the server but leaves the password out) prints each mail and its link to the console instead. */
const missing = Object.entries({ SMTP_HOST, SMTP_USER, SMTP_PASS })
	.filter(([, v]) => !v)
	.map(([k]) => k);
const transport = missing.length
	? null
	: nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE, auth: { user: SMTP_USER, pass: SMTP_PASS } });
if (!transport) (dev ? console.info : console.warn)(`mail: ${missing.join(", ")} not set; account mail is printed to the console instead of sent`);

const html = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

function page(title: string, lines: string[], action: { label: string; url: string } | null): string {
	const button = action
		? `<p style="margin:28px 0"><a href="${html(action.url)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:#1f1d1a;color:#faf8f4;text-decoration:none;font-weight:500">${html(action.label)}</a></p>
<p style="color:#6b665e;font-size:13px">Or open this link: <a href="${html(action.url)}" style="color:#6b665e;word-break:break-all">${html(action.url)}</a></p>`
		: "";
	return `<!doctype html><html><body style="margin:0;background:#f6f3ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1d1a">
<div style="max-width:520px;margin:40px auto;padding:36px 32px;background:#fffdf9;border:1px solid #e6e0d4;border-radius:12px">
<p style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:20px">Libiamo</p>
<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:24px">${html(title)}</h1>
${lines.map((l) => `<p style="margin:0 0 12px;line-height:1.55">${html(l)}</p>`).join("\n")}
${button}
</div></body></html>`;
}

function mail(to: string, subject: string, lines: string[], action: { label: string; url: string } | null): Mail {
	const text = [...lines, ...(action ? ["", `${action.label}: ${action.url}`] : [])].join("\n");
	return { to, subject: `Libiamo · ${subject}`, text, html: page(subject, lines, action) };
}

export const mails = {
	verify: (to: string, url: string) =>
		mail(to, "Confirm your email", ["Open the link to confirm this address and finish signing up. It works for an hour."], {
			label: "Confirm email",
			url,
		}),
	changeEmail: (to: string, url: string) =>
		mail(to, "Confirm your new email", ["Open the link to make this your address on Libiamo. Until then, your old one still signs in."], {
			label: "Confirm new email",
			url,
		}),
	resetPassword: (to: string, url: string) =>
		mail(to, "Set a new password", ["Open the link to choose a new password. It works for an hour. If you didn't ask for it, ignore this mail."], {
			label: "Set new password",
			url,
		}),
	firstPassword: (to: string, url: string) =>
		mail(to, "Set a password", ["Open the link to choose a password, so you can also sign in with your email. It works for an hour."], {
			label: "Set password",
			url,
		}),
	alreadySignedUp: (to: string) =>
		mail(
			to,
			"You already have an account",
			[
				"Someone, probably you, tried to create a Libiamo account with this address. It already has one.",
				"Sign in, or set a new password if you've forgotten it.",
			],
			{ label: "Sign in", url: `${ORIGIN}/sign-in` },
		),
};

/** Sends without making the caller wait or fail: a mail that cannot go is logged, and the page's answer is the same. */
export function send(m: Mail): void {
	if (!transport) {
		console.info(`mail to ${m.to}: ${m.subject}\n${m.text}`);
		return;
	}
	transport.sendMail({ from: SMTP_FROM ?? SMTP_USER, to: m.to, subject: m.subject, text: m.text, html: m.html }).catch((error) => {
		console.error(`mail: could not send "${m.subject}"`, error);
	});
}
