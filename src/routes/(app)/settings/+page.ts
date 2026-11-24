import { signInSetup } from "#lib/account/account.remote.ts";
import { opening } from "#lib/client/refresh.ts";

// The server's sign-in setup does not change while it runs: what the browser holds is never asked again.
export const load = opening(() => [signInSetup()]);
