import { relative, sep } from "node:path";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
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
