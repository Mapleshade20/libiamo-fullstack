import { relative, sep } from "node:path";
import adapter from "@sveltejs/adapter-node";
import { materializeErrorTemplate } from "./scripts/error-template.mjs";

const base = process.env.BASE_PATH ?? "";
const errorTemplate = materializeErrorTemplate({
	sourceUrl: new URL("./src/error.html", import.meta.url),
	outputUrl: new URL("./.svelte-kit/error.html", import.meta.url),
	base,
});

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes("node_modules");

			return isExternalLibrary ? undefined : true;
		},
	},
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter(),
		files: {
			errorTemplate,
		},
		// Base path is baked in at build time. Empty for local dev and root-domain
		// deploys; set to e.g. "/se-projects/libiamo" when the site is served from a
		// sub-path. Every internal URL must go through `base` from "$app/paths".
		paths: {
			base,
		},
		alias: {
			$routes: "src/routes",
		},
	},
};

export default config;
