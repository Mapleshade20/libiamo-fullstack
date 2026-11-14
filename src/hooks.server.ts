import { redirect } from "@sveltejs/kit";
import { type Handle, sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { auth } from "#lib/server/auth/auth.ts";
import { sql } from "#lib/server/db/index.ts";
import { building } from "$app/env";

/* adapter-node emits this once every connection has closed (SIGTERM from tini, SIGINT, or idle). */
process.on("sveltekit:shutdown", async (reason) => {
	console.log(`shutdown: ${reason}`);
	await sql.end({ timeout: 5 });
});
/* A failed promise nobody waited for (a model call made ahead of need) is a bug to log, never a reason to end the one
   process every learner's revision lives in. */
process.on("unhandledRejection", (e) => console.error("unhandled rejection:", e));

const handleAuth: Handle = async ({ event, resolve }) => {
	const found = await auth.api.getSession({ headers: event.request.headers });
	if (found) {
		event.locals.session = found.session;
		event.locals.user = found.user;
	}
	return svelteKitHandler({ event, resolve, auth, building });
};

/** Pages for someone signed out; a signed-in visitor to the first two goes in instead. */
const SIGNED_OUT = ["/sign-in", "/sign-up", "/verify", "/forgot-password"];
/** Paths that answer anyone: Better Auth, the probe, the interface strings the signed-out pages speak. */
const OPEN = ["/api/auth/", "/health", "/api/i18n/"];

/*
 * Who may see what, decided here before any page or remote function runs (a redirect thrown inside a query called
 * from the browser is not honoured, sveltejs/kit#17262). Remote functions and endpoints still check the learner
 * themselves: a refused request to them is a 401, never a redirect.
 */
const handleAccess: Handle = ({ event, resolve }) => {
	const path = event.url.pathname;
	const user = event.locals.user;
	if (building || OPEN.some((p) => path.startsWith(p))) return resolve(event);
	if (path.startsWith("/_app/remote/")) return resolve(event);
	if (path.startsWith("/api/")) return user ? resolve(event) : Response.json({ error: "Sign in first." }, { status: 401 });
	if (SIGNED_OUT.includes(path)) {
		if (user && (path === "/sign-in" || path === "/sign-up")) redirect(303, user.onboardedAt ? "/" : "/welcome");
		return resolve(event);
	}
	if (!user) redirect(303, "/sign-in");
	if (!user.onboardedAt && path !== "/welcome") redirect(303, "/welcome");
	if ((path === "/admin" || path.startsWith("/admin/")) && user.role !== "admin") return new Response("Not found", { status: 404 });
	return resolve(event);
};

export const handle = sequence(handleAuth, handleAccess);
