import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], insert: vi.fn() }));

vi.mock("$lib/server/db", () => {
	const chain = () => {
		const query = Promise.resolve(mocks.rows) as Promise<unknown[]> & Record<string, unknown>;
		for (const method of ["from", "leftJoin", "where", "orderBy", "limit"]) query[method] = vi.fn(() => query);
		return query;
	};
	const insert = (table: unknown) => ({
		values: (values: unknown) => ({ onConflictDoNothing: async () => mocks.insert(table, values) }),
	});
	return { db: { select: vi.fn(chain), insert } };
});

import { listHallAnnouncements, markAnnouncementRead } from "$lib/server/announcement";

describe("Hall announcements", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.rows = [];
	});

	it("marks each live announcement read or unread for the learner", async () => {
		const publishedAt = new Date("2026-10-01T00:00:00Z");
		mocks.rows = [
			{ id: 2, title: "New", body: "b", publishedAt, readAt: null },
			{ id: 1, title: "Old", body: "a", publishedAt, readAt: new Date("2026-10-02T00:00:00Z") },
		];

		expect(await listHallAnnouncements("user-1")).toEqual([
			{ id: 2, title: "New", body: "b", publishedAt, read: false },
			{ id: 1, title: "Old", body: "a", publishedAt, read: true },
		]);
	});

	it("records an acknowledgement only while the announcement is live", async () => {
		expect(await markAnnouncementRead("user-1", 3)).toBe(false);
		expect(mocks.insert).not.toHaveBeenCalled();

		mocks.rows = [{ id: 3 }];
		expect(await markAnnouncementRead("user-1", 3)).toBe(true);
		expect(mocks.insert).toHaveBeenCalledWith(expect.anything(), { userId: "user-1", announcementId: 3 });
	});
});
