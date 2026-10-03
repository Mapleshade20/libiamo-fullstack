import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	current: [] as unknown[],
	inUse: false,
	locked: false,
	updates: [] as unknown[],
}));

vi.mock("$lib/server/db", () => {
	// `.for("update")` ends the row-lock read, `.limit()` the usage check; bare chains are subqueries.
	const select = () => {
		const chain: Record<string, unknown> = {};
		chain.from = () => chain;
		chain.where = () => chain;
		chain.for = async (strength: string) => {
			state.locked = strength === "update";
			return state.current;
		};
		chain.limit = async () => (state.inUse ? [{ id: 7 }] : []);
		return chain;
	};
	const tx = {
		select,
		update: () => ({ set: (values: unknown) => ({ where: async () => void state.updates.push(values) }) }),
		delete: () => ({ where: async () => {} }),
		insert: () => ({ values: async () => {} }),
	};
	return { db: { select, transaction: async (run: (transaction: typeof tx) => Promise<unknown>) => run(tx) } };
});

import type { TaskInput } from "$lib/admin/task-actions";
import { TaskIdentityLockedError, TaskNotFoundError, updateTask } from "$lib/server/admin/tasks";

const identity = { language: "en", interactionType: "chat", ui: "imessage" } as const;
const input = (overrides: Partial<TaskInput> = {}) => ({ ...identity, title: "Weekend plans", ...overrides }) as TaskInput;

beforeEach(() => {
	state.current = [identity];
	state.inUse = false;
	state.locked = false;
	state.updates = [];
});

describe("updateTask", () => {
	it("edits a used task's content in place under a row lock", async () => {
		state.inUse = true;
		await updateTask(7, input({ title: "Weekend in Lisbon" }), { rotation: "none" });
		expect(state.locked).toBe(true);
		expect(state.updates).toEqual([expect.objectContaining({ title: "Weekend in Lisbon" })]);
	});

	it("refuses to change the language, kind or interface of a task learners have", async () => {
		state.inUse = true;
		for (const change of [{ language: "es" }, { ui: "discord" }, { interactionType: "translate", ui: "translator" }] as const) {
			await expect(updateTask(7, input(change), { rotation: "none" })).rejects.toBeInstanceOf(TaskIdentityLockedError);
		}
		expect(state.updates).toEqual([]);
	});

	it("lets an unused task change anything", async () => {
		await updateTask(7, input({ language: "es", ui: "discord" }), { rotation: "none" });
		expect(state.updates).toEqual([expect.objectContaining({ language: "es", ui: "discord" })]);
	});

	it("reports a missing task", async () => {
		state.current = [];
		await expect(updateTask(7, input(), { rotation: "none" })).rejects.toBeInstanceOf(TaskNotFoundError);
	});
});
