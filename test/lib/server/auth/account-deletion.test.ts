import { describe, expect, it, vi } from "vitest";
import {
	type AuthAccountStore,
	createAccountDeleteHook,
	type LockedAuthAccountTransaction,
	UNLINK_ACCOUNT_PATH,
} from "$lib/server/auth/account-deletion";

/** An in-memory stand-in for the locked Postgres transaction the hook runs inside. */
function createStore(accountIds: string[]) {
	const remaining = new Set(accountIds);
	const transaction: LockedAuthAccountTransaction = {
		listAccountIds: vi.fn(async () => [...remaining]),
		deleteAccount: vi.fn(async (_userId, accountId) => remaining.delete(accountId)),
	};
	const store: AuthAccountStore = {
		withUserLock: vi.fn(async (_userId, operation) => operation(transaction)),
	};
	return { store, transaction, remaining };
}

const unlinkContext = { path: UNLINK_ACCOUNT_PATH };

describe("account delete guard", () => {
	it("deletes the account inside the lock and stops Better Auth from deleting it again", async () => {
		const { store, transaction, remaining } = createStore(["credential", "github"]);

		const result = await createAccountDeleteHook(store)({ id: "github", userId: "user-1" }, unlinkContext);

		expect(result).toBe(false);
		expect(store.withUserLock).toHaveBeenCalledWith("user-1", expect.any(Function));
		expect(transaction.deleteAccount).toHaveBeenCalledWith("user-1", "github");
		expect([...remaining]).toEqual(["credential"]);
	});

	it("refuses to remove the only remaining login method", async () => {
		const { store, transaction } = createStore(["credential"]);

		await expect(createAccountDeleteHook(store)({ id: "credential", userId: "user-1" }, unlinkContext)).rejects.toMatchObject({
			body: { code: "FAILED_TO_UNLINK_LAST_ACCOUNT" },
		});
		expect(transaction.deleteAccount).not.toHaveBeenCalled();
	});

	it("rejects an account that does not belong to the user", async () => {
		const { store, transaction } = createStore(["credential", "github"]);

		await expect(createAccountDeleteHook(store)({ id: "google", userId: "user-1" }, unlinkContext)).rejects.toMatchObject({
			body: { code: "ACCOUNT_NOT_FOUND" },
		});
		expect(transaction.deleteAccount).not.toHaveBeenCalled();
	});

	it("reports a delete that matched no row as a missing account", async () => {
		const { store, transaction } = createStore(["credential", "github"]);
		vi.mocked(transaction.deleteAccount).mockResolvedValueOnce(false);

		await expect(createAccountDeleteHook(store)({ id: "github", userId: "user-1" }, unlinkContext)).rejects.toMatchObject({
			body: { code: "ACCOUNT_NOT_FOUND" },
		});
	});

	// `deleteUser` bulk-deletes a user's accounts before the user row. Guarding that
	// path would refuse to remove the last login method, and returning `false` aborts
	// `deleteManyWithHooks` outright, leaving the remaining rows behind their owner.
	describe("scoping", () => {
		it("stays out of the way of account deletes that are not unlinks", async () => {
			const { store, remaining } = createStore(["credential"]);

			const result = await createAccountDeleteHook(store)({ id: "credential", userId: "user-1" }, { path: "/delete-user" });

			expect(result).toBeUndefined();
			expect(store.withUserLock).not.toHaveBeenCalled();
			expect([...remaining]).toEqual(["credential"]);
		});

		it("stays out of the way when there is no endpoint context at all", async () => {
			const { store } = createStore(["credential"]);

			await expect(createAccountDeleteHook(store)({ id: "credential", userId: "user-1" }, null)).resolves.toBeUndefined();
			await expect(createAccountDeleteHook(store)({ id: "credential", userId: "user-1" })).resolves.toBeUndefined();
			expect(store.withUserLock).not.toHaveBeenCalled();
		});
	});
});
