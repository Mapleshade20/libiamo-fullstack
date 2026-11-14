import { createAuthClient } from "better-auth/svelte";

/** Better Auth from the browser: the same origin, mounted at /api/auth. */
export const authClient = createAuthClient();
