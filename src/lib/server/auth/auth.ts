import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { db } from "#lib/server/db/index.ts";
import { getRequestEvent } from "$app/server";
import { createAuthOptions } from "./options.ts";
import { authStore } from "./store.ts";

export const auth = betterAuth({
	...createAuthOptions(authStore),
	database: drizzleAdapter(db, { provider: "pg" }),
	plugins: [sveltekitCookies(getRequestEvent)], // must be last
});

export type Session = typeof auth.$Infer.Session;
