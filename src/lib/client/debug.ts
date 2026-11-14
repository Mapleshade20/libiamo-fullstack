import { account } from "#lib/account/account.svelte.ts";
import { dev } from "$app/env";

/** The debug tools (the call bubbles, the developer settings) are for development and for admins, never a learner. */
export const debugging = () => dev || account.me.role === "admin";
