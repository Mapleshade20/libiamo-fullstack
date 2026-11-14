import { sql } from "#lib/server/db/index.ts";

/* adapter-node emits this once every connection has closed (SIGTERM from tini, SIGINT, or idle). */
process.on("sveltekit:shutdown", async (reason) => {
	console.log(`shutdown: ${reason}`);
	await sql.end({ timeout: 5 });
});
