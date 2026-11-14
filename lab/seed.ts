// The development database's scenarios and issues, from the content document: node --experimental-transform-types lab/seed.ts
// [file], default lab/seed/scenarios.json. Replaces what is there with the same ids; touches nothing else.
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "#lib/server/db/schema.ts";
import { importContent } from "#lib/server/scenario/content.ts";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
const file = process.argv[2] ?? new URL("seed/scenarios.json", import.meta.url).pathname;
const client = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
try {
	const n = await importContent(drizzle(client, { schema }), JSON.parse(readFileSync(file, "utf8")));
	console.log(`seeded ${n.scenarios} scenarios, ${n.issues} issues`);
} finally {
	await client.end();
}
