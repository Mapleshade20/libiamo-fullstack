import type { Handle } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { ensureAsyncReplyWorker } from "$lib/server/async-replies/boot";
import { auth } from "$lib/server/auth/auth";
import { sql } from "$lib/server/db";

ensureAsyncReplyWorker();

process.on("sveltekit:shutdown", async (reason) => {
	console.log(`SvelteKit shutdown: ${reason}`);

	await globalThis.__asyncReplyWorker?.stop();
	await sql.end({
		timeout: 5,
	});
});

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
