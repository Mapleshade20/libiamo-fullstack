import { beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "$routes/(app)/task/[id]/+page.server";

const { mockLimit, mockSelect, mockFindFirst } = vi.hoisted(() => {
	const mockLimit = vi.fn();
	const mockWhere = vi.fn(() => ({ limit: mockLimit }));
	const mockLeftJoin: any = vi.fn(() => ({ leftJoin: mockLeftJoin, where: mockWhere }));
	const mockInnerJoin = vi.fn(() => ({ leftJoin: mockLeftJoin }));
	const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	const mockFindFirst = vi.fn();
	return { mockLimit, mockSelect, mockFindFirst };
});

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
		query: {
			practiceSession: {
				findFirst: mockFindFirst,
			},
		},
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

		await expect(load({ locals: { user: { id: "u1", activeLanguage: "en" } }, params: { id: "42" } } as any)).rejects.toMatchObject({
			status: 404,
			body: { message: "Task not found" },
		});
		expect(mockFindFirst).not.toHaveBeenCalled();
	});

	it("returns task payload with latest session status when found", async () => {
		const row = {
			id: 42,
			title: "Task title",
			templateUi: "discord",
			pointReward: 10,
		};
		mockLimit.mockResolvedValueOnce([row]);
		mockFindFirst.mockResolvedValueOnce({ status: "evaluated" });

		const result = await load({
			locals: { user: { id: "u1", activeLanguage: "en" } },
			params: { id: "42" },
		} as any);

		expect(mockSelect).toHaveBeenCalled();
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			task: {
				...row,
				sessionStatus: "evaluated",
			},
		});
	});

	it("returns task payload even when task language differs from active language", async () => {
		const row = {
			id: 42,
			title: "Spanish task",
			language: "es",
			templateUi: "discord",
			pointReward: 10,
		};
		mockLimit.mockResolvedValueOnce([row]);
		mockFindFirst.mockResolvedValueOnce(null);

		const result = await load({
			locals: { user: { id: "u1", activeLanguage: "en" } },
			params: { id: "42" },
		} as any);

		expect(result).toEqual({
			task: {
				...row,
				sessionStatus: null,
			},
		});
	});

	it("returns null sessionStatus when latest session does not exist", async () => {
		const row = {
			id: 42,
			title: "Task title",
			templateUi: "discord",
			pointReward: 10,
		};
		mockLimit.mockResolvedValueOnce([row]);
		mockFindFirst.mockResolvedValueOnce(null);

		const result = await load({
			locals: { user: { id: "u1", activeLanguage: "en" } },
			params: { id: "42" },
		} as any);

		expect(result).toEqual({
			task: {
				...row,
				sessionStatus: null,
			},
		});
	});
});
