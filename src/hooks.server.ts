import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";
import { isLanguageCode } from "$lib/constants";
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

const handleDocumentLanguage: Handle = ({ event, resolve }) => {
	const activeLanguage = event.locals.user?.activeLanguage;
	const documentLanguage = isLanguageCode(activeLanguage) ? activeLanguage : "en";
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('<html lang="en">', `<html lang="${documentLanguage}">`),
	});
};

export const handle: Handle = sequence(handleBetterAuth, handleDocumentLanguage);
