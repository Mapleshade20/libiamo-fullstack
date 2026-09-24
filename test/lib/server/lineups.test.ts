import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectQueue } = vi.hoisted(() => ({ selectQueue: [] as unknown[][] }));

vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(() => {
			const chain = Promise.resolve(selectQueue.shift() ?? []) as Promise<unknown[]> & Record<string, unknown>;
			for (const method of ["from", "innerJoin", "where", "orderBy", "limit"]) chain[method] = vi.fn(() => chain);
			return chain;
		}),
	},
}));

import { currentLineupStarts, resolveTaskLineup } from "$lib/server/lineups";

describe("currentLineupStarts", () => {
	it("starts daily lineups on the local date and weekly lineups on its ISO Monday", () => {
		expect(currentLineupStarts("2026-09-24")).toEqual({ daily: "2026-09-24", weekly: "2026-09-21" });
		expect(currentLineupStarts("2026-09-27")).toEqual({ daily: "2026-09-27", weekly: "2026-09-21" });
	});
});

describe("resolveTaskLineup", () => {
	const input = { taskId: 4, language: "en" as const, localDate: "2026-09-24" };

	beforeEach(() => {
		selectQueue.length = 0;
	});

	it("has no lineup for a task that was never lined up", async () => {
		selectQueue.push([]);
		expect(await resolveTaskLineup(input)).toEqual({ lineupId: null, pinned: false });
	});

	it("pins a requested lineup only when it contains the task", async () => {
		selectQueue.push([{ lineupId: 9 }, { lineupId: 3 }]);
		expect(await resolveTaskLineup({ ...input, requestedLineupId: 3 })).toEqual({ lineupId: 3, pinned: true });

		selectQueue.push([{ lineupId: 9 }, { lineupId: 3 }], []);
		expect(await resolveTaskLineup({ ...input, requestedLineupId: 5 })).toEqual({ lineupId: 9, pinned: false });
	});

	it("prefers a current lineup over a newer past one, then the most recent", async () => {
		// memberships newest first, then the ids of the lineups current today
		selectQueue.push([{ lineupId: 12 }, { lineupId: 10 }], [{ id: 10 }, { id: 11 }]);
		expect(await resolveTaskLineup(input)).toEqual({ lineupId: 10, pinned: false });

		selectQueue.push([{ lineupId: 12 }, { lineupId: 10 }], []);
		expect(await resolveTaskLineup(input)).toEqual({ lineupId: 12, pinned: false });
	});
});
