import { relative, sep } from "node:path";
import adapter from "@sveltejs/adapter-node";

/** @type {import('@sveltejs/kit').Config} */
const config = {
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
	kit: {
		adapter: adapter(),
		// The model layer as the rehearsal lab had it; it moves into the domains under src/lib/server in phase 2.
		alias: {
			$model: "src/model",
		},
	},
};

export default config;
