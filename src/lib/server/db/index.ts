import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "$env/dynamic/private";
import * as schema from "./schema";

if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

const dbDebug = env.DB_DEBUG === "1";

export const sql = postgres(env.DATABASE_URL, {
	max: 10,
	debug: dbDebug
		? (connection, query, parameters) => {
				console.log(
					JSON.stringify({
						time: new Date().toISOString(),
						connection,
						query,
						parameters,
					}),
				);
			}
		: undefined,
	connection: {
		TimeZone: "UTC",
	},
});

export const db = drizzle(sql, { schema });
