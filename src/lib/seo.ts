/*
 * What search engines may see. Only the public pages (routes/(public)) are indexed and listed in the sitemap; every
 * other page says noindex. Crawlers are kept off the signed-in pages (they only redirect to the sign-in page); the
 * signed-out pages stay crawlable so their noindex is read.
 */
export const PUBLIC_PAGES = [
	{
		path: "/about",
		title: "Libiamo · Write for real readers",
		description: "Write in the language you are learning for real readers, and go over it with a tutor until it says what you meant.",
	},
	{ path: "/changelog", title: "Changelog · Libiamo", description: "What changed in Libiamo, newest first." },
	{ path: "/privacy", title: "Privacy Policy · Libiamo", description: "What Libiamo keeps, why, who else receives it, and for how long." },
	{ path: "/terms", title: "Terms of Service · Libiamo", description: "The terms of using Libiamo." },
] as const;

/** The top of every path only a signed-in learner reaches (test/lib/seo.test.ts checks it against the routes). */
export const SIGNED_IN_PATHS = [
	"/_app/remote/",
	"/admin",
	"/api/",
	"/collect",
	"/contribute",
	"/feedback",
	"/library",
	"/live",
	"/notebook",
	"/profile",
	"/review",
	"/scenario",
	"/settings",
	"/w/",
	"/welcome",
	"/writing",
];

/** A route's address: route groups leave it unchanged. */
export const routePath = (routeId: string) => routeId.replace(/\/\([^)]+\)/g, "") || "/";

/** The head of the page at `routeId`: indexed with its address and description if it is public, noindex otherwise. */
export function metaOf(origin: string, routeId: string | null) {
	const path = routeId === null ? null : routePath(routeId);
	const pub = PUBLIC_PAGES.find((p) => p.path === path);
	return {
		title: pub?.title ?? "Libiamo",
		robots: pub ? "index, follow" : "noindex",
		canonical: pub ? new URL(pub.path, origin).href : null,
		description: pub?.description ?? null,
		image: new URL("/brand/icon-512.png", origin).href,
	};
}
