import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
	mockDb: {
		select: vi.fn(() => mockDb),
		from: vi.fn(() => mockDb),
		where: vi.fn(() => Promise.resolve([{ id: 1, front: "hola", back: "hello", cardType: "vocabulary" }])),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));

import { load } from "$routes/(app)/review/cards/+page.server";

describe("review cards page server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects when user is not authenticated", async () => {
		await expect(load({ locals: { user: null }, params: {} } as any)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
	});

	it("returns cards for authenticated user", async () => {
		const result: any = await load({ locals: { user: { id: "user-1" } }, params: {} } as any);
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0].front).toBe("hola");
	});
});
