import { beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "$routes/(app)/task/[id]/+page.server";

const { mockLimit, mockSelect } = vi.hoisted(() => {
	const mockLimit = vi.fn();
	const mockWhere = vi.fn(() => ({ limit: mockLimit }));
	const mockLeftJoin = vi.fn(() => ({ where: mockWhere }));
	const mockInnerJoin = vi.fn(() => ({ leftJoin: mockLeftJoin }));
	const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	return { mockLimit, mockSelect };
});

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
	},
}));

describe("Task detail +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects when user is not authenticated", async () => {
		await expect(load({ locals: { user: null }, params: { id: "1" } } as any)).rejects.toMatchObject({
			status: 302,
			location: "/sign-in",
		});
	});

	it("returns 404 when task id is invalid", async () => {
		await expect(load({ locals: { user: { activeLanguage: "en" } }, params: { id: "abc" } } as any)).rejects.toMatchObject({
			status: 404,
			body: { message: "Task not found" },
		});
	});

	it("returns 404 when task query is empty", async () => {
		mockLimit.mockResolvedValueOnce([]);

		await expect(load({ locals: { user: { activeLanguage: "en" } }, params: { id: "42" } } as any)).rejects.toMatchObject({
			status: 404,
			body: { message: "Task not found" },
		});
	});

	it("returns task payload when found", async () => {
		const row = {
			id: 42,
			title: "Task title",
			templateUi: "discord",
			pointReward: 10,
		};
		mockLimit.mockResolvedValueOnce([row]);

		const result = await load({
			locals: { user: { activeLanguage: "en" } },
			params: { id: "42" },
		} as any);

		expect(mockSelect).toHaveBeenCalled();
		expect(result).toEqual({ task: row });
	});
});
