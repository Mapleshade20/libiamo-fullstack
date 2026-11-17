import { error } from "@sveltejs/kit";
import { z } from "zod";
import { callsOf, deleteUser, USERS_PAGE, users } from "#lib/server/admin/users.ts";
import { logAuthEvent } from "#lib/server/auth/audit.ts";
import { admin } from "#lib/server/guard.ts";
import { command, query } from "$app/server";

/* Every account and its calls, for the admin, a page at a time; deleting one. */
export const userList = query(z.object({ q: z.string().max(200).default(""), page: z.number().int().min(0).default(0) }), async ({ q, page }) => {
	admin();
	return users({ q, offset: page * USERS_PAGE });
});

export const userOne = query(z.string().max(100), async (id) => {
	admin();
	return (await users({ ids: [id] })).rows[0] ?? null;
});

export const userCalls = query(z.string().max(100), async (id) => {
	admin();
	return callsOf(id);
});

export const deleteOneUser = command(z.object({ id: z.string().max(100), email: z.string().max(254) }), async ({ id, email }) => {
	const me = admin();
	if (id === me.id) error(400, "Delete your own account from your settings.");
	const target = (await users({ ids: [id] })).rows[0];
	// The address typed again, as a learner deleting their own account does.
	if (!target || target.email.toLowerCase() !== email.trim().toLowerCase()) error(400, "The address does not match.");
	await deleteUser(id);
	logAuthEvent("auth.account_deleted", { userId: id, email: target.email, by: me.id });
});
