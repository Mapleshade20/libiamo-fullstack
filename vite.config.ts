import { relative, sep } from "node:path";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
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
		}),
	],
	server: { host: "127.0.0.1" },
	test: {
		include: ["test/**/*.test.ts"],
	},
});
