import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDueNotes } = vi.hoisted(() => ({ mockGetDueNotes: vi.fn() }));

vi.mock("$lib/server/review", () => ({ getDueNotes: mockGetDueNotes }));

import { load } from "$routes/(app)/review/+page.server";

describe("review page server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetDueNotes.mockResolvedValue([
			{
				id: 1,
				vocab: "hola",
				nativeDefinition: "hello",
				targetDefinition: "a greeting",
				nativeText: "你好。",
				targetText: "Hola.",
				queueKind: "new",
				previewIntervals: { again: "1m", hard: "6m", good: "10m", easy: "4d" },
			},
		]);
	});

	const event = (user: unknown) => ({ locals: { user } }) as never;

	it("redirects unauthenticated users", async () => {
		await expect(load(event(null))).rejects.toMatchObject({ status: 302, location: "/sign-in" });
	});

	it("returns the random example and bilingual card fields for due Notes", async () => {
		const result = (await load(event({ id: "user-1", activeLanguage: "es" }))) as any;
		expect(result.cards).toEqual([
			{
				id: 1,
				vocab: "hola",
				nativeDefinition: "hello",
				nativeText: "你好。",
				targetText: "Hola.",
				queueKind: "new",
				previewIntervals: { again: "1m", hard: "6m", good: "10m", easy: "4d" },
			},
		]);
		expect(mockGetDueNotes).toHaveBeenCalledWith("user-1", "es", 20);
	});

	it("defaults to English and recovers from a database failure", async () => {
		mockGetDueNotes.mockRejectedValue(new Error("DB error"));
		const result = (await load(event({ id: "user-1" }))) as any;
		expect(result.cards).toEqual([]);
		expect(mockGetDueNotes).toHaveBeenCalledWith("user-1", "en", 20);
	});

	it("rejects invalid language codes", async () => {
		await expect(load(event({ id: "user-1", activeLanguage: "zz" }))).rejects.toMatchObject({ status: 400 });
	});
});
