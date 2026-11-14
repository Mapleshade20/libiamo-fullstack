import type { Session } from "#lib/server/auth/auth.ts";

declare global {
	namespace App {
		interface Locals {
			/** Set by hooks.server.ts for a signed-in learner. */
			user?: Session["user"];
			session?: Session["session"];
		}
	}
}
