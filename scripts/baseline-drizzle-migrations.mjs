import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is not set");
}

const db = postgres(databaseUrl, { max: 1 });

const migrations = readMigrationFiles({
	migrationsFolder: "./drizzle",
});

await db`CREATE SCHEMA IF NOT EXISTS drizzle`;

await db`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )
`;

for (const migration of migrations) {
	const existing = await db`
    SELECT id
    FROM drizzle.__drizzle_migrations
    WHERE created_at = ${migration.folderMillis}
    LIMIT 1
  `;

	if (existing.length === 0) {
		await db`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${migration.hash}, ${migration.folderMillis})
    `;

		console.log(`Baselined migration ${migration.folderMillis}`);
	} else {
		console.log(`Already baselined migration ${migration.folderMillis}`);
	}
}

await db.end();

console.log("Done.");
