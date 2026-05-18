import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ["test/**/*.{test,spec}.{js,ts}"],
		coverage: {
			reporter: ["text", "lcov"],
			provider: "v8",
			include: ["src/routes/**/*.ts", "src/lib/server/*.ts", "src/lib/components/practice-ui/**/*.ts", "src/lib/markdown.ts"],
			exclude: ["src/lib/components/practice-ui/types.ts", "src/lib/components/practice-ui/**/types.ts", "src/lib/components/practice-ui/**/i18n.ts"],
			thresholds: {
				lines: 85,
				functions: 70,
				branches: 90,
				statements: 85,
			},
		},
		env: {
			DATABASE_URL: "postgresql://dummy:dummy@localhost:5432/dummy",
		},
	},
});
