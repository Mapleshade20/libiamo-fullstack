import { and, eq } from "drizzle-orm";
import type { AuthAccountStore } from "$lib/server/auth/account-deletion";
import { db } from "$lib/server/db";
import { account, user } from "$lib/server/db/schema";

export const postgresAuthAccountStore: AuthAccountStore = {
	withUserLock: (userId, operation) =>
		db.transaction(async (transaction) => {
			const [lockedUser] = await transaction.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");

			if (!lockedUser) {
				return operation({
					listAccountIds: async () => [],
					deleteAccount: async () => false,
				});
			}

			return operation({
				listAccountIds: async (ownerId) => {
					const rows = await transaction.select({ id: account.id }).from(account).where(eq(account.userId, ownerId));
					return rows.map(({ id }) => id);
				},
				deleteAccount: async (ownerId, accountId) => {
					const rows = await transaction
						.delete(account)
						.where(and(eq(account.userId, ownerId), eq(account.id, accountId)))
						.returning({ id: account.id });
					return rows.length === 1;
				},
			});
		}),
};
