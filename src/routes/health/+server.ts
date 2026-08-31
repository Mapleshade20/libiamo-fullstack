import { sql } from "$lib/server/db";
import type { RequestHandler } from "./$types";

/**
 * Unauthenticated liveness/readiness probe required by the deployment platform.
 * The container healthcheck and the internal Nginx both target this path.
 *
 * The database round-trip is deliberate: the app is useless without Postgres, so
 * a green healthcheck should mean "can actually serve requests", not just "Node
 * is listening".
 */
export const GET: RequestHandler = async () => {
	try {
		await sql`select 1`;
	} catch (error) {
		console.error("health: database check failed", error);
		return new Response(JSON.stringify({ status: "error", database: "down" }), {
			status: 503,
			headers: { "content-type": "application/json", "cache-control": "no-store" },
		});
	}

	return new Response(JSON.stringify({ status: "ok" }), {
		status: 200,
		headers: { "content-type": "application/json", "cache-control": "no-store" },
	});
};
