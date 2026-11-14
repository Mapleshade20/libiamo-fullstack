import { and, eq, inArray, ne, sql as raw } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { account, user } from "#lib/server/db/schema.ts";
import type { AuthStore } from "./options.ts";

export const authStore: AuthStore = {
	unlinkAccount: (userId, accountId) =>
		db.transaction(async (tx) => {
			await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
			const rows = await tx.select({ id: account.id }).from(account).where(eq(account.userId, userId));
			if (!rows.some((r) => r.id === accountId)) return "missing";
			if (rows.length === 1) return "last";
			await tx.delete(account).where(and(eq(account.userId, userId), eq(account.id, accountId)));
			return "deleted";
		}),
	hasPassword: async (userId) => {
		const [row] = await db
			.select({ id: account.id })
			.from(account)
			.where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
			.limit(1);
		return !!row;
	},
	grantAdmin: async (userId, emails) => {
		const rows = await db
			.update(user)
			.set({ role: "admin" })
			.where(and(eq(user.id, userId), eq(user.emailVerified, true), ne(user.role, "admin"), inArray(raw`lower(${user.email})`, [...emails])))
			.returning({ id: user.id });
		return rows.length > 0;
	},
	clearPendingEmail: async (userId) => {
		await db.update(user).set({ pendingEmail: null }).where(eq(user.id, userId));
	},
};
