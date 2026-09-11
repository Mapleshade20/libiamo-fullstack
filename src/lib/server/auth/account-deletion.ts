import { APIError } from "better-auth/api";

export interface AuthAccountToDelete {
	id: string;
	userId: string;
}

export interface LockedAuthAccountTransaction {
	listAccountIds(userId: string): Promise<string[]>;
	deleteAccount(userId: string, accountId: string): Promise<boolean>;
}

export interface AuthAccountStore {
	withUserLock<T>(userId: string, operation: (transaction: LockedAuthAccountTransaction) => Promise<T>): Promise<T>;
}

function accountError(code: "ACCOUNT_NOT_FOUND" | "FAILED_TO_UNLINK_LAST_ACCOUNT", message: string) {
	return new APIError("BAD_REQUEST", { code, message });
}

export function createAccountDeleteHook(store: AuthAccountStore) {
	return async (account: AuthAccountToDelete) => {
		await store.withUserLock(account.userId, async (transaction) => {
			const accountIds = await transaction.listAccountIds(account.userId);
			if (!accountIds.includes(account.id)) {
				throw accountError("ACCOUNT_NOT_FOUND", "Account not found");
			}
			if (accountIds.length === 1) {
				throw accountError("FAILED_TO_UNLINK_LAST_ACCOUNT", "You cannot unlink your last login method");
			}
			if (!(await transaction.deleteAccount(account.userId, account.id))) {
				throw accountError("ACCOUNT_NOT_FOUND", "Account not found");
			}
		});

		// The guarded transaction performed the deletion. Returning false prevents
		// Better Auth's adapter from issuing a second, unguarded delete.
		return false as const;
	};
}
