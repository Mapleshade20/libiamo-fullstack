import { defineEnvVars } from "@sveltejs/kit/env";

/* Every variable the server reads, checked when it starts. DEPLOYMENT.md describes each. */

const flag = (value: string | undefined) => ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
const optional = (value: string | undefined) => value?.trim() || undefined;
const list = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);

export const variables = defineEnvVars({
	DATABASE_URL: { description: "Postgres connection string, e.g. postgres://libiamo:secret@127.0.0.1:5432/libiamo" },
	DB_DEBUG: { description: "Log every query (1/true/yes/on).", schema: flag },

	ORIGIN: { description: "The public origin, e.g. https://libiamo.net; adapter-node and Better Auth build URLs from it." },
	ADDRESS_HEADER: { description: "The header the reverse proxy puts the visitor's address in (adapter-node trusts it too).", schema: optional },

	BETTER_AUTH_SECRET: {
		description: "32+ random characters (openssl rand -base64 32). Signs sessions and encrypts learners' keys; changing it ends every session.",
		schema: (value) => {
			if (!value || value.length < 32) throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
			return value;
		},
	},
	ADMIN_EMAILS: { description: "Comma-separated addresses that become admins once verified and signed in.", schema: list },
	AUTH_AUDIT_LOG: { description: "One JSON line per account event (it carries the address).", schema: flag },
	GOOGLE_CLIENT_ID: { schema: optional },
	GOOGLE_CLIENT_SECRET: { schema: optional },
	GITHUB_CLIENT_ID: { schema: optional },
	GITHUB_CLIENT_SECRET: { schema: optional },
	TURNSTILE_SITE_KEY: { description: "Cloudflare Turnstile; both keys or neither.", schema: optional },
	TURNSTILE_SECRET_KEY: { schema: optional },

	SMTP_HOST: { description: "Without it, mail is printed to the console (development only).", schema: optional },
	SMTP_PORT: { schema: (value) => Number(value?.trim() || 465) },
	SMTP_SECURE: { schema: (value) => (value === undefined ? true : flag(value)) },
	SMTP_FROM: { schema: optional },
	SMTP_USER: { schema: optional },
	SMTP_PASS: { schema: optional },
});
