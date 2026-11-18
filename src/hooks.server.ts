import { redirect } from "@sveltejs/kit";
import { type Handle, sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { dirOf, htmlLang } from "#lib/i18n/langs.ts";
import { perRequest } from "#lib/scope.ts";
import { accessOf } from "#lib/server/access.ts";
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
	// The pool closes whatever went wrong before it, or its connections keep the process alive until it is killed.
	try {
		stopSourceRunner();
		await stopAgentReplyWorker();
		await flushRevisions();
	} catch (e) {
		console.error("shutdown:", e);
	} finally {
		await sql.end({ timeout: 5 });
	}
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

/* Who may see what (server/access.ts), before any page or remote function runs. */
const handleAccess: Handle = ({ event, resolve }) => {
	if (building) return resolve(event);
	const user = event.locals.user;
	const access = accessOf(event.url.pathname, user ? { onboarded: !!user.onboardedAt, admin: user.role === "admin" } : null, event.isDataRequest);
	if ("redirect" in access) redirect(303, access.redirect);
	if ("status" in access)
		return access.status === 401 ? Response.json({ error: "Sign in first." }, { status: 401 }) : new Response("Not found", { status: 404 });
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
