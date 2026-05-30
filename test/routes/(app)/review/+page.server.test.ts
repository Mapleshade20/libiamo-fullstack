import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockReviewCards } = vi.hoisted(() => ({
	mockDb: {
		select: vi.fn(() => mockDb),
		from: vi.fn(() => mockDb),
		where: vi.fn(() => Promise.resolve([{ id: 1, front: "hola", back: "hello", cardType: "vocabulary" }])),
	},
	mockReviewCards: {
		getDueCards: vi.fn(),
		getReviewStats: vi.fn(),
	},
}));

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/review-cards", () => mockReviewCards);

import { load } from "$routes/(app)/review/+page.server";

describe("review page server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockReviewCards.getDueCards.mockResolvedValue([
			{ id: 1, front: "hola", back: "hello", cardType: "vocabulary", previewIntervals: { Again: "1d", Hard: "3d" } },
		]);
		mockReviewCards.getReviewStats.mockResolvedValue({ total: 10, due: 3 });
	});

	const mockEvent = (user: unknown) =>
		({
			locals: { user },
		}) as any;

	it("redirects when user is not authenticated", async () => {
		await expect(load(mockEvent(null))).rejects.toMatchObject({ status: 302, location: "/sign-in" });
	});

	it("returns cards, stats, and language for authenticated user", async () => {
		const result: any = await load(mockEvent({ id: "user-1", activeLanguage: "es" }));
		expect(result.cards).toHaveLength(1);
		expect(result.cards[0].front).toBe("hola");
		expect(result.stats).toEqual({ total: 10, due: 3 });
		expect(result.language).toBe("es");
	});

	it("defaults language to en when user has no activeLanguage", async () => {
		const result: any = await load(mockEvent({ id: "user-1" }));
		expect(result.language).toBe("en");
	});

	it("returns empty arrays when getDueCards throws", async () => {
		mockReviewCards.getDueCards.mockRejectedValue(new Error("DB error"));
		mockReviewCards.getReviewStats.mockResolvedValue({});
		const result: any = await load(mockEvent({ id: "user-1", activeLanguage: "en" }));
		expect(result.cards).toEqual([]);
		expect(result.stats).toEqual({});
	});

	it("filters out invalid language codes with 400", async () => {
		await expect(load(mockEvent({ id: "user-1", activeLanguage: "zz" }))).rejects.toMatchObject({ status: 400 });
	});

	it("returns allCards for the user", async () => {
		const result: any = await load(mockEvent({ id: "user-1", activeLanguage: "en" }));
		expect(result.allCards).toHaveLength(1);
		expect(result.allCards[0].cardType).toBe("vocabulary");
	});
});
