import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		alias: {
			$lib: resolve("src/lib"),
			"$env/dynamic/private": resolve("src/worker/private-env.ts"),
		},
	},
	build: {
		ssr: resolve("src/worker/async-replies.ts"),
		outDir: "build/worker",
		emptyOutDir: true,
		minify: false,
		rollupOptions: {
			external: ["postgres", "openai"],
			output: {
				entryFileNames: "async-replies.js",
			},
		},
	},
});
