import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ["test/**/*.{test,spec}.{js,ts}"],
		coverage: {
			reporter: ["text"],
			provider: "v8",
			include: ["src/routes/**/*.ts", "src/lib/server/*.ts"],
			thresholds: {
				lines: 85,
				functions: 70,
				branches: 90,
				statements: 85,
			},
		},
	},
});
