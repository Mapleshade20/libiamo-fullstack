import { redirect } from "@sveltejs/kit";
import { type Handle, sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { dirOf, htmlLang } from "#lib/i18n/langs.ts";
import { perRequest } from "#lib/scope.ts";
import { pageSetup } from "#lib/server/account/page.ts";
import { auth } from "#lib/server/auth/auth.ts";
import { sql } from "#lib/server/db/index.ts";
import { ensureAgentReplyWorker, stopAgentReplyWorker } from "#lib/server/exchange/agents/boot.ts";
import { pruneCalls } from "#lib/server/llm/records.ts";
import { abandonStale, flushRevisions, pruneRevisions, pruneTapes } from "#lib/server/revision/store.ts";
import { ensureSourceRunner, stopSourceRunner } from "#lib/server/translation/runner.ts";
import { building } from "$app/env";
import { getRequestEvent } from "$app/server";

/* adapter-node emits this once every connection has closed (SIGTERM from tini, SIGINT, or idle). */
process.on("sveltekit:shutdown", async (reason) => {
	console.log(`shutdown: ${reason}`);
	// The cast's replies in flight finish first; every revision in memory is written, so a restart picks each one up.
	stopSourceRunner();
	await stopAgentReplyWorker();
	await flushRevisions();
	await sql.end({ timeout: 5 });
});
/* A failed promise nobody waited for (a model call made ahead of need) is a bug to log, never a reason to end the one
   process every learner's revision lives in. */
process.on("unhandledRejection", (e) => console.error("unhandled rejection:", e));

/* The cast of every exchange answers from a worker in this process (server/exchange/agents); translation sources are
   made by another (server/translation/runner.ts). */
ensureAgentReplyWorker();
ensureSourceRunner();

/* Model call records older than thirty days go (design §5.7), finished pieces' tapes as long after, and revision
   snapshots finished pieces left behind: a minute after start, then every six hours. */
if (!building) {
	const prune = () => {
		pruneCalls()
			.then((n) => n && console.log(`llm_call: ${n} records past thirty days removed`))
			.catch((e) => console.error("llm_call prune failed:", e));
		pruneRevisions()
			.then((n) => n && console.log(`piece_revision: ${n} snapshots of finished pieces removed`))
			.catch((e) => console.error("piece_revision prune failed:", e));
		pruneTapes()
			.then((n) => n && console.log(`piece_step: the tapes of ${n} finished pieces removed`))
			.catch((e) => console.error("piece_step prune failed:", e));
	};
	setTimeout(prune, 60_000).unref();
	setInterval(prune, 6 * 3_600_000).unref();
	// Unfinished pieces nobody will finish are abandoned (what was written stays): every half hour.
	const sweep = () =>
		abandonStale()
			.then((n) => n && console.log(`piece: ${n} unfinished pieces abandoned`))
			.catch((e) => console.error("abandoning stale pieces failed:", e));
	setTimeout(sweep, 90_000).unref();
	setInterval(sweep, 30 * 60_000).unref();
}

/* The state that belongs to a learner (lib/scope.ts) is kept per request on the server, never shared between them. */
const STATE = Symbol("learner state");
perRequest(() => {
	const locals = getRequestEvent().locals as App.Locals & { [STATE]?: Map<object, unknown> };
	locals[STATE] ??= new Map();
	return locals[STATE];
});

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
/** Paths that answer anyone: Better Auth, the probe, the interface strings the signed-out pages speak, crawlers' files. */
const OPEN = ["/api/auth/", "/health", "/api/i18n/", "/robots.txt", "/sitemap.xml"];
/** The pages anyone may read, signed in, signed out or not set up yet (routes/(public)). */
const DOCUMENTS = ["/about", "/terms", "/privacy", "/changelog"];

/*
 * Who may see what, decided here before any page or remote function runs (a redirect thrown inside a query called
 * from the browser is not honoured, sveltejs/kit#17262). Remote functions and endpoints still check the learner
 * themselves: a refused request to them is a 401, never a redirect.
 */
const handleAccess: Handle = ({ event, resolve }) => {
	const path = event.url.pathname;
	const user = event.locals.user;
	if (building || OPEN.some((p) => path.startsWith(p)) || DOCUMENTS.includes(path)) return resolve(event);
	if (path.startsWith("/_app/remote/")) return resolve(event);
	if (path.startsWith("/api/")) return user ? resolve(event) : Response.json({ error: "Sign in first." }, { status: 401 });
	if (SIGNED_OUT.includes(path)) {
		if (user && (path === "/sign-in" || path === "/sign-up")) redirect(303, user.onboardedAt ? "/" : "/welcome");
		return resolve(event);
	}
	// A visitor at the site's address sees what Libiamo is; anywhere else, the way in.
	if (!user) redirect(303, path === "/" ? "/about" : "/sign-in");
	if (!user.onboardedAt && path !== "/welcome") redirect(303, "/welcome");
	if ((path === "/admin" || path.startsWith("/admin/")) && user.role !== "admin") return new Response("Not found", { status: 404 });
	return resolve(event);
};

/* <html> as the learner set it up: the language worked in, the theme, the backdrop, the sidebar folded. */
const handlePage: Handle = ({ event, resolve }) => {
	const p = pageSetup(event);
	const classes = [p.folded && "side-folded", event.route.id?.startsWith("/(focus)") && "focused"].filter(Boolean).join(" ");
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			html
				.replace('<html lang="en" dir="ltr"', `<html lang="${htmlLang(p.lang)}" dir="${dirOf(p.lang)}"`)
				.replace("%html.class%", classes)
				.replace("%theme%", p.theme)
				.replace("%backdrop%", p.backdrop),
	});
};

export const handle = sequence(handleAuth, handleAccess, handlePage);
