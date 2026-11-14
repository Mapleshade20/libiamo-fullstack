import { defineEnvVars } from "@sveltejs/kit/env";

const flag = (value: string | undefined) => ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: "Postgres connection string, e.g. postgres://libiamo:secret@127.0.0.1:5432/libiamo",
	},
	DB_DEBUG: {
		description: "Log every query (1/true/yes/on).",
		schema: flag,
	},
});
