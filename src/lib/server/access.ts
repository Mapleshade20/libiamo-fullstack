/*
 * Who may see what, decided before any page or remote function runs (hooks.server.ts; a redirect thrown inside a query
 * called from the browser is not honoured, sveltejs/kit#17262). Remote functions and endpoints still check the learner
 * themselves: a refused request to them is a 401, never a redirect.
 */

/** Pages for someone signed out; a signed-in visitor to the first two goes in instead. */
const SIGNED_OUT = ["/sign-in", "/sign-up", "/verify", "/forgot-password"];
/** Paths that answer anyone: Better Auth, the probe, the interface strings the signed-out pages speak, crawlers' files. */
const OPEN = ["/api/auth/", "/health", "/api/i18n/", "/robots.txt", "/sitemap.xml"];
/** The pages anyone may read, signed in, signed out or not set up yet (routes/(public)). */
const DOCUMENTS = ["/about", "/terms", "/privacy", "/changelog"];

export type Visitor = { onboarded: boolean; admin: boolean } | null;
export type Access = { go: true } | { redirect: string } | { status: 401 | 404 };

/** `data`: a page's data asked for from a page of the app (Kit's data request), not the page itself. */
export function accessOf(path: string, visitor: Visitor, data = false): Access {
	const go = { go: true } as const;
	if (OPEN.some((p) => path.startsWith(p)) || DOCUMENTS.includes(path) || path.startsWith("/_app/remote/")) return go;
	if (path.startsWith("/api/")) return visitor ? go : { status: 401 };
	if (SIGNED_OUT.includes(path)) {
		if (visitor && (path === "/sign-in" || path === "/sign-up")) return { redirect: visitor.onboarded ? "/" : "/welcome" };
		return go;
	}
	// A visitor at the site's address sees what Libiamo is; anywhere else, the way in. A page's data asked for from a page
	// of the app (a session that ended while it was open) is someone who was in: the way in too.
	if (!visitor) return { redirect: path === "/" && !data ? "/about" : "/sign-in" };
	if (!visitor.onboarded && path !== "/welcome") return { redirect: "/welcome" };
	if ((path === "/admin" || path.startsWith("/admin/")) && !visitor.admin) return { status: 404 };
	return go;
}
