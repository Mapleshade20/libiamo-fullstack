import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { env } from "$env/dynamic/private";
import { postgresAuthAccountStore } from "$lib/server/auth/account-deletion.postgres";
import { createAuthOptions } from "$lib/server/auth/options";
import { db } from "$lib/server/db";

export const auth = betterAuth({
	...createAuthOptions(env, { accountStore: postgresAuthAccountStore }),
	database: drizzleAdapter(db, { provider: "pg" }),
	plugins: [
		sveltekitCookies(getRequestEvent), // must be last
	],
});
