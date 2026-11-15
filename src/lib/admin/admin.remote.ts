import { waitingCounts } from "#lib/server/admin/waiting.ts";
import { admin } from "#lib/server/guard.ts";
import { query } from "$app/server";

/* What waits on the admin, beside each section. Commands that change a count refresh it. */
export const waiting = query(async () => {
	admin();
	return waitingCounts();
});
