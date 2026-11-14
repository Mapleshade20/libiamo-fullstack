import { sql } from "#lib/server/db/index.ts";

const answer = (status: number, body: object) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/*
 * The probe the container, the quadlet and the operations monitor call. It asks the database too: without Postgres the
 * app cannot serve anything, so green means it can.
 */
export async function GET() {
	try {
		await sql`select 1`;
	} catch (error) {
		console.error("health: database check failed", error);
		return answer(503, { status: "error", database: "down" });
	}
	return answer(200, { status: "ok" });
}
