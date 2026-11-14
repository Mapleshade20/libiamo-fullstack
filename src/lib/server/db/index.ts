import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DATABASE_URL, DB_DEBUG } from "$app/env/private";
import * as schema from "./schema.ts";

/* The pool connects on the first query, so importing this module (the build's analysis does) opens nothing. */
export const sql = postgres(DATABASE_URL, {
	max: 10,
	connection: { TimeZone: "UTC" },
	debug: DB_DEBUG
		? (connection, query, parameters) => console.log(JSON.stringify({ time: new Date().toISOString(), connection, query, parameters }))
		: undefined,
});

export const db = drizzle(sql, { schema });
