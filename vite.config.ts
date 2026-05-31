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
			include: [
				"src/routes/**/*.ts",
				"src/lib/server/*.ts",
				"src/lib/components/**/*.ts",
				"src/lib/constants.ts",
				"src/lib/markdown.ts",
				"src/lib/schemas.ts",
			],
			exclude: [
				// No executable logic — pure translation keys
				"**/i18n.ts",
				// Type-only definitions, no runtime code
				"**/types.ts",
				"**/*.d.ts",
				// Barrel re-exports, no logic
				"**/index.ts",
				// Internal utility helpers tested indirectly through component tests
				"src/lib/components/utils/*.ts",
				// Static demo data (pre-seeded fake users/messages), zero logic
				"src/lib/components/practice-ui/reddit/data.ts",
				// Thin SvelteKit request-handler glue — underlying service functions
				// (rateCard, getDueCards, etc.) are tested at 98% in review-cards.test.ts
				"src/routes/api/review/**/+server.ts",
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
