import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRAWL_DISALLOWED_PATHS, PUBLIC_SEARCH_PAGES, resolveSearchMetadata, routePath } from "$lib/app/seo";

// Route ids of every page, derived from the files the same way SvelteKit does.
const pageRouteIds = globSync("**/+page.svelte", { cwd: "src/routes" }).map((file) => `/${file.replace(/\/?\+page\.svelte$/, "")}`);

describe("search metadata", () => {
	it.each(PUBLIC_SEARCH_PAGES)("gives $path its own absolute canonical and metadata", ({ path, title, description }) => {
		const metadata = resolveSearchMetadata("https://libiamo.test", "/mounted", path);
		expect(metadata).toMatchObject({
			canonical: `https://libiamo.test/mounted${path}`,
			title,
			description,
			robots: "index, follow",
			image: "https://libiamo.test/mounted/brand/icon-512.png",
		});
	});

	it.each([
		null,
		"/",
		"/(auth)/sign-in",
		"/(auth)/sign-up",
		"/(auth)/forgot-password",
		"/(auth)/verify",
		"/(app)/review",
		"/(app)/admin",
		"/unknown",
		"/(public)/welcome/example",
	])("excludes %s from indexing without assigning another page's canonical", (routeId) => {
		expect(resolveSearchMetadata("https://libiamo.test", "", routeId)).toMatchObject({ canonical: null, robots: "noindex" });
	});

	it("lists only pages that exist", () => {
		const paths = pageRouteIds.map(routePath);
		for (const { path } of PUBLIC_SEARCH_PAGES) expect(paths).toContain(path);
	});

	it("keeps crawlers out of every signed-in page except the root redirect", () => {
		const appPaths = pageRouteIds
			.filter((id) => id.startsWith("/(app)/") && !id.startsWith("/(app)/(demo)/"))
			.map(routePath)
			.filter((path) => path !== "/");
		expect(appPaths.length).toBeGreaterThan(0);
		for (const path of appPaths)
			expect(
				CRAWL_DISALLOWED_PATHS.some((prefix) => path.startsWith(prefix)),
				path,
			).toBe(true);
	});

	it("strips route groups from route ids", () => {
		expect(routePath("/(public)/(documents)/privacy")).toBe("/privacy");
		expect(routePath("/(app)/(hall)")).toBe("/");
	});
});
