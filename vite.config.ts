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
			include: ["src/routes/**/*.ts", "src/lib/**/*.ts"],
			exclude: [
				// Pure data: translation strings and declarative Drizzle tables
				"src/lib/i18n/{en,es,fr,ja}.ts",
				"src/lib/server/db/*.schema.ts",
				"src/lib/server/db/schema.ts",
				"src/lib/server/db/enums.ts",
				// Type-only definitions, no runtime code
				"**/types.ts",
				"**/*.d.ts",
				// Generated shadcn-svelte primitives and barrel re-exports
				"src/lib/components/ui/**",
				"src/lib/schemas/index.ts",
				// Static demo data (pre-seeded fake users/messages), zero logic
				"src/lib/components/practice/ui/reddit/data.ts",
				// Load function tested (auth gate, redirects, session state);
				// four form actions are pure glue: parse FormData → validate → call already-tested service
				"**/feedback/+page.server.ts",
			],
			thresholds: {
				lines: 85,
				functions: 70,
				branches: 80,
				statements: 85,
			},
		},
		env: {
			DATABASE_URL: "postgresql://dummy:dummy@localhost:5432/dummy",
		},
	},
});
