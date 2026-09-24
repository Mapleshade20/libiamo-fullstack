import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	candidates: [] as unknown[],
	findLineup: vi.fn(),
	listLineupTasks: vi.fn(),
	addTaskToLineup: vi.fn(),
}));

vi.mock("$lib/server/db", () => {
	const chain = () => {
		const query = Promise.resolve(mocks.candidates) as Promise<unknown[]> & Record<string, unknown>;
		for (const method of ["from", "where", "orderBy"]) query[method] = vi.fn(() => query);
		return query;
	};
	return { db: { select: vi.fn(chain) } };
});
vi.mock("$lib/server/lineups", async (importOriginal) => ({
	LineupError: (await importOriginal<typeof import("$lib/server/lineups")>()).LineupError,
	findLineup: mocks.findLineup,
	listLineupTasks: mocks.listLineupTasks,
	addTaskToLineup: mocks.addTaskToLineup,
}));

import { LineupError } from "$lib/server/lineups";
import { actions, load } from "$routes/(app)/admin/lineups/+page.server";

const admin = { id: "admin-1", role: "admin" };

function event(search = "", fields: Record<string, string> = {}) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return {
		locals: { user: admin },
		url: new URL(`https://libiamo.test/admin/lineups${search}`),
		request: { formData: async () => formData },
	} as never;
}

describe("admin lineups", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.candidates = [];
		mocks.findLineup.mockResolvedValue(null);
		mocks.listLineupTasks.mockResolvedValue([]);
	});

	it("shows a weekly lineup by its Monday and offers only tasks not already in it", async () => {
		mocks.findLineup.mockResolvedValue({ id: 5 });
		mocks.listLineupTasks.mockResolvedValue([{ id: 1, title: "In lineup" }]);
		mocks.candidates = [
			{ id: 1, title: "In lineup" },
			{ id: 2, title: "Available" },
		];

		const result = (await load(event("?kind=weekly&date=2026-W39&language=fr"))) as any;

		expect(mocks.findLineup).toHaveBeenCalledWith("fr", "weekly", "2026-09-21");
		expect(result.filters).toMatchObject({ kind: "weekly", rawDate: "2026-W39", startsOn: "2026-09-21", language: "fr" });
		expect(result.candidates).toEqual([{ id: 2, title: "Available" }]);
	});

	it("falls back to a valid date for the chosen kind", async () => {
		const result = (await load(event("?kind=daily&date=2026-W39&language=xx"))) as any;
		expect(result.filters.rawDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(result.filters.language).toBe("en");
	});

	it("adds a task to the lineup starting on the requested period", async () => {
		expect(await actions.add(event("", { taskId: "2", kind: "weekly", date: "2026-W39" }))).toEqual({ success: true });
		expect(mocks.addTaskToLineup).toHaveBeenCalledWith({ taskId: 2, kind: "weekly", startsOn: "2026-09-21" });
	});

	it("reports invalid input and lineup conflicts", async () => {
		expect(await actions.add(event("", { taskId: "2", kind: "weekly", date: "2026-09-24" }))).toMatchObject({
			status: 400,
			data: { errors: { date: expect.any(Array) } },
		});
		mocks.addTaskToLineup.mockRejectedValue(new LineupError("This task is already in that lineup"));
		expect(await actions.add(event("", { taskId: "2", kind: "daily", date: "2026-09-24" }))).toMatchObject({
			status: 400,
			data: { message: "This task is already in that lineup" },
		});
	});
});
