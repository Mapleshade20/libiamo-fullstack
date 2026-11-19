import { relative, sep } from "node:path";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import { i18nStrings } from "./scripts/vite-i18n.ts";

export default defineConfig(({ command }) => ({
	plugins: [
		i18nStrings(),
		tailwindcss(),
		sveltekit({
			// Remote functions (query/command/form) carry the app's data; they need Svelte's async mode. Both are
			// experimental, so Kit and Svelte are pinned to a minor version (docs/design/2026-11-13-step-3-rebuild.md).
			experimental: { remoteFunctions: true },
			compilerOptions: {
				experimental: { async: true },
				// Runes everywhere except in node_modules. Can be removed in Svelte 6.
				runes: ({ filename }) =>
					relative(import.meta.dirname, filename)
						.toLowerCase()
						.split(sep)
						.includes("node_modules")
						? undefined
						: true,
			},
			adapter: adapter(),
			/*
			 * What a page may load: the app's own origin, Turnstile (its script and frame, on the signed-out pages), the
			 * learner's Gravatar picture and the beacon Cloudflare's Web Analytics adds to each page (it reports to the site's
			 * own /cdn-cgi/rum). Kit adds a nonce to every script it writes and to app.html's
			 * (`%sveltekit.nonce%`). Styles stay 'unsafe-inline': Svelte writes style attributes and its transitions insert
			 * style rules. A new third party goes here, and into the privacy policy, or the browser refuses it.
			 */
			csp: {
				mode: "auto",
				directives: {
					"default-src": ["self"],
					"script-src": ["self", "https://challenges.cloudflare.com", "https://static.cloudflareinsights.com"],
					"style-src": ["self", "unsafe-inline"],
					"img-src": ["self", "data:", "https://gravatar.com", "https://*.gravatar.com"],
					"font-src": ["self"],
					// The dev server's hot updates come over a WebSocket.
					"connect-src": command === "serve" ? ["self", "ws:"] : ["self"],
					"frame-src": ["https://challenges.cloudflare.com"],
					"object-src": ["none"],
					"base-uri": ["self"],
					"form-action": ["self"],
					"frame-ancestors": ["none"],
				},
			},
		}),
	],
	server: { host: "127.0.0.1" },
	test: {
		include: ["test/**/*.test.ts"],
	},
}));
