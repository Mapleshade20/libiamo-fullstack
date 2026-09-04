import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQuestHallPreparation, QuestHallPreparationRequestError } from "$lib/server/quest-hall-preparation";
import { GET } from "$routes/api/quest-hall/preparation/+server";

const { mockGetQuestHallPreparation, mockGetBrowserTimezone } = vi.hoisted(() => ({
	mockGetQuestHallPreparation: vi.fn(),
	mockGetBrowserTimezone: vi.fn(() => "Europe/Paris"),
}));

vi.mock("$lib/server/browser-timezone", () => ({ getBrowserTimezone: mockGetBrowserTimezone }));
vi.mock("$lib/server/quest-hall-preparation", async (importOriginal) => {
	const original = await importOriginal<typeof import("$lib/server/quest-hall-preparation")>();
	return { ...original, getQuestHallPreparation: mockGetQuestHallPreparation };
});

function event(user: unknown, query = "task=daily-7&edition=2026-09-04") {
	return {
		locals: { user },
		cookies: { get: vi.fn() },
		url: new URL(`https://libiamo.test/api/quest-hall/preparation?${query}`),
	};
}

describe("GET /api/quest-hall/preparation", () => {
	beforeEach(() => vi.clearAllMocks());

	it("requires authentication", async () => {
		const response = await GET(event(null) as any);
		expect(response.status).toBe(401);
		expect(getQuestHallPreparation).not.toHaveBeenCalled();
	});

	it("returns the validated preparation payload", async () => {
		const user = { id: "u1", activeLanguage: "en", nativeLanguage: "fr" };
		const preparation = { kind: "quest", key: "daily-7", data: { task: { id: 7 }, nativeLanguage: "fr" } };
		mockGetQuestHallPreparation.mockResolvedValueOnce(preparation);

		const response = await GET(event(user) as any);

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toEqual({ preparation });
		expect(getQuestHallPreparation).toHaveBeenCalledWith({
			user,
			key: "daily-7",
			editionDate: "2026-09-04",
			browserTimezone: "Europe/Paris",
		});
	});

	it("preserves safe client error statuses", async () => {
		mockGetQuestHallPreparation.mockRejectedValueOnce(new QuestHallPreparationRequestError(409, "This Quest Hall edition is no longer current"));
		const response = await GET(event({ id: "u1" }) as any);
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: "This Quest Hall edition is no longer current" });
	});

	it("returns not found for a selection that is no longer available", async () => {
		mockGetQuestHallPreparation.mockResolvedValueOnce(null);
		const response = await GET(event({ id: "u1" }) as any);
		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toEqual({ error: "Preparation not found" });
	});
});
