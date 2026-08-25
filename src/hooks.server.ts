import type { Handle } from "@sveltejs/kit";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { ensureAgentReplyWorker } from "$lib/server/agent-replies/boot";
import { auth } from "$lib/server/auth/auth";
import { sql } from "$lib/server/db";

ensureAgentReplyWorker();

process.on("sveltekit:shutdown", async (reason) => {
	console.log(`SvelteKit shutdown: ${reason}`);

	await globalThis.__agentReplyWorker?.worker.stop();
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
