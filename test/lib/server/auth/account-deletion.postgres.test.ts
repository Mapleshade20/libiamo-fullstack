import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The guard's whole reason to exist is the row lock: Better Auth already counts
 * a user's accounts before unlinking, it just does the counting and the delete in
 * two unsynchronised steps. These tests drive the real store against a recording
 * query builder so the lock, the transaction scoping and the `where` clauses are
 * covered rather than simulated.
 */
const { mockDb, recorded, selectQueue, deleteQueue } = vi.hoisted(() => {
	type Operation = { kind: "select" | "delete"; table: unknown; where: unknown; lock?: string; inTransaction: boolean };
	const recorded: Operation[] = [];
	const selectQueue: unknown[][] = [];
	const deleteQueue: unknown[][] = [];

	/** A drizzle query builder that records how it was chained and resolves to queued rows. */
	const builder = (operation: Operation, rows: unknown[]) => {
		recorded.push(operation);
		const chain = Promise.resolve(rows) as Promise<unknown[]> & {
			from: () => typeof chain;
			where: (condition: unknown) => typeof chain;
			for: (mode: string) => typeof chain;
			returning: () => typeof chain;
		};
		chain.from = () => chain;
		chain.where = (condition: unknown) => {
			operation.where = condition;
			return chain;
		};
		chain.for = (mode: string) => {
			operation.lock = mode;
			return chain;
		};
		chain.returning = () => chain;
		return chain;
	};

	const queryBuilder = (inTransaction: boolean) => ({
		select: () => builder({ kind: "select", table: null, where: null, inTransaction }, selectQueue.shift() ?? []),
		delete: (table: unknown) => builder({ kind: "delete", table, where: null, inTransaction }, deleteQueue.shift() ?? []),
	});

	const mockDb = {
		...queryBuilder(false),
		transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(queryBuilder(true))),
	};

	return { mockDb, recorded, selectQueue, deleteQueue };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/db/schema", () => ({
	account: { id: "account.id", userId: "account.userId" },
	user: { id: "user.id" },
}));
vi.mock("drizzle-orm", () => ({
	eq: vi.fn((column, value) => ({ op: "eq", column, value })),
	and: vi.fn((...conditions) => ({ op: "and", conditions })),
}));

const { postgresAuthAccountStore } = await import("$lib/server/auth/account-deletion.postgres");

describe("postgres account store", () => {
	beforeEach(() => {
		recorded.length = 0;
		selectQueue.length = 0;
		deleteQueue.length = 0;
		mockDb.transaction.mockClear();
	});

	it("takes a row lock on the user before reading their accounts", async () => {
		selectQueue.push([{ id: "user-1" }], [{ id: "credential" }, { id: "github" }]);

		const accountIds = await postgresAuthAccountStore.withUserLock("user-1", (transaction) => transaction.listAccountIds("user-1"));

		expect(accountIds).toEqual(["credential", "github"]);
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		const [lock, list] = recorded;
		expect(lock).toMatchObject({ kind: "select", lock: "update", inTransaction: true, where: { column: "user.id", value: "user-1" } });
		expect(list).toMatchObject({ kind: "select", inTransaction: true, where: { column: "account.userId", value: "user-1" } });
		expect(list.lock).toBeUndefined();
	});

	it("deletes inside the same transaction, scoped to the owner and the account", async () => {
		selectQueue.push([{ id: "user-1" }]);
		deleteQueue.push([{ id: "github" }]);

		const deleted = await postgresAuthAccountStore.withUserLock("user-1", (transaction) => transaction.deleteAccount("user-1", "github"));

		expect(deleted).toBe(true);
		const remove = recorded.at(-1);
		expect(remove).toMatchObject({ kind: "delete", table: { id: "account.id" }, inTransaction: true });
		expect(remove?.where).toEqual({
			op: "and",
			conditions: [
				{ op: "eq", column: "account.userId", value: "user-1" },
				{ op: "eq", column: "account.id", value: "github" },
			],
		});
	});

	it("reports a delete that matched no row", async () => {
		selectQueue.push([{ id: "user-1" }]);
		deleteQueue.push([]);

		await expect(postgresAuthAccountStore.withUserLock("user-1", (transaction) => transaction.deleteAccount("user-1", "github"))).resolves.toBe(
			false,
		);
	});

	// A user deleted between Better Auth's own read and this lock must not look like
	// a user who still owns accounts, or the guard would wave the delete through.
	it("sees no accounts when the user row is gone", async () => {
		selectQueue.push([]);

		const result = await postgresAuthAccountStore.withUserLock("user-1", async (transaction) => ({
			ids: await transaction.listAccountIds("user-1"),
			deleted: await transaction.deleteAccount("user-1", "github"),
		}));

		expect(result).toEqual({ ids: [], deleted: false });
		expect(recorded.filter(({ kind }) => kind === "delete")).toHaveLength(0);
	});
});
