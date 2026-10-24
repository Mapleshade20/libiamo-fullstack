const DEFAULT_DESCRIPTION = "Practice real-world language skills through simulated conversations, translation, feedback, and spaced review.";

// Only these public, canonical pages belong in search results and the sitemap.
export const PUBLIC_SEARCH_PAGES = [
	{
		path: "/welcome",
		title: "Libiamo · Language through living conversation",
		description: "Practice the language moments textbooks leave out through realistic conversations, thoughtful feedback, and spaced review.",
	},
	{ path: "/changelog", title: "Changelog · Libiamo", description: "A concise record of notable Libiamo releases and product changes." },
	{ path: "/privacy", title: "Privacy Policy · Libiamo", description: "How Libiamo collects, uses, stores, and shares personal information." },
	{ path: "/terms", title: "Terms of Service · Libiamo", description: "Terms governing access to and use of Libiamo." },
] as const;

// Signed-in surfaces only redirect anonymous visitors, so crawling them wastes requests. Auth pages stay
// crawlable and carry noindex.
export const CRAWL_DISALLOWED_PATHS = ["/api/", "/admin", "/archive", "/contribute", "/profile", "/review", "/task"];

// Route groups leave URLs unchanged, so pages can move between groups without losing their entry.
export function routePath(routeId: string): string {
	return routeId.replace(/\/\([^)]+\)/g, "") || "/";
}

export function resolveSearchMetadata(origin: string, base: string, routeId: string | null) {
	const path = routeId === null ? null : routePath(routeId);
	const publicPage = PUBLIC_SEARCH_PAGES.find((entry) => entry.path === path);
	return {
		title: publicPage?.title ?? "Libiamo",
		description: publicPage?.description ?? DEFAULT_DESCRIPTION,
		canonical: publicPage ? new URL(`${base}${publicPage.path}`, origin).href : null,
		robots: publicPage ? "index, follow" : "noindex",
		image: new URL(`${base}/brand/icon-512.png`, origin).href,
	};
}
