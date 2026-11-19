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
	DATABASE_POOL_MAX: {
		description: "Connections the server keeps to Postgres at most (default 10); keep it under the server's max_connections.",
		schema: (value) => {
			const n = Number(value?.trim() || 10);
			if (!Number.isInteger(n) || n < 1) throw new Error("DATABASE_POOL_MAX must be a whole number of connections");
			return n;
		},
	},

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

	SMTP_HOST: {
		description: "Mail is sent only with SMTP_HOST, SMTP_USER and SMTP_PASS; otherwise it is printed to the console (development only).",
		schema: optional,
	},
	SMTP_PORT: { schema: (value) => Number(value?.trim() || 465) },
	SMTP_SECURE: { schema: (value) => (value === undefined ? true : flag(value)) },
	SMTP_FROM: { schema: optional },
	SMTP_USER: { schema: optional },
	SMTP_PASS: { schema: optional },

	OPENROUTER_API_KEY: {
		description:
			"The service's own OpenRouter key, for the calls no learner makes (translation sources, name tables, Scene Lab). Learners' calls use their own key.",
		schema: optional,
	},
	LLM_CACHE_DIR: { description: "Development only: answer model calls from this cache and write new replies to it.", schema: optional },
	LLM_CACHE_ONLY: { description: "Development only: a call the cache does not hold fails instead of reaching the provider.", schema: flag },
});
