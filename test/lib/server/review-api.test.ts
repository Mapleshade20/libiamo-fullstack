import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDueNotes, mockGetReviewStats, mockRateNote } = vi.hoisted(() => ({
	mockGetDueNotes: vi.fn(),
	mockGetReviewStats: vi.fn(),
	mockRateNote: vi.fn(),
}));

vi.mock("$lib/server/review", () => ({
	getDueNotes: mockGetDueNotes,
	getReviewStats: mockGetReviewStats,
	rateNote: mockRateNote,
}));

import { POST as rateNote } from "../../../src/routes/api/review/[noteId]/rate/+server";
import { GET as dueNotes } from "../../../src/routes/api/review/due/+server";
import { GET as stats } from "../../../src/routes/api/review/stats/+server";

function mockEvent(overrides: { user?: unknown; body?: unknown; params?: Record<string, string>; invalidJson?: boolean }) {
	return {
		locals: { user: overrides.user ?? null },
		request: {
			json: overrides.invalidJson ? async () => Promise.reject(new SyntaxError("invalid")) : async () => overrides.body ?? {},
		},
		params: overrides.params ?? {},
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("GET /api/review/due", () => {
	it("requires authentication", async () => {
		expect((await dueNotes(mockEvent({ user: null }))).status).toBe(401);
	});

	it("returns due Notes and stats for the active language", async () => {
		mockGetDueNotes.mockResolvedValue([{ id: 1, front: "Prompt", back: "Answer" }]);
		mockGetReviewStats.mockResolvedValue({ dueToday: 1 });
		const response = await dueNotes(mockEvent({ user: { id: "u", activeLanguage: "fr" } }));
		expect(await response.json()).toEqual({
			cards: [{ id: 1, front: "Prompt", back: "Answer" }],
			stats: { dueToday: 1 },
		});
		expect(mockGetDueNotes).toHaveBeenCalledWith("u", "fr", 20);
	});
});

describe("GET /api/review/stats", () => {
	it("requires authentication", async () => {
		expect((await stats(mockEvent({ user: null }))).status).toBe(401);
	});
});

describe("POST /api/review/[noteId]/rate", () => {
	it("requires authentication and validates the Note ID", async () => {
		expect((await rateNote(mockEvent({ user: null }))).status).toBe(401);
		expect((await rateNote(mockEvent({ user: { id: "u" }, params: { noteId: "xyz" } }))).status).toBe(400);
	});

	it("rejects invalid JSON and invalid rating data", async () => {
		expect((await rateNote(mockEvent({ user: { id: "u" }, params: { noteId: "1" }, invalidJson: true }))).status).toBe(400);
		expect((await rateNote(mockEvent({ user: { id: "u" }, params: { noteId: "1" }, body: { rating: 9, elapsedSeconds: -1 } }))).status).toBe(400);
	});

	it("rates an owned Note", async () => {
		mockRateNote.mockResolvedValue({ nextDue: "2026-01-01T00:00:00.000Z" });
		const response = await rateNote(mockEvent({ user: { id: "u" }, params: { noteId: "12" }, body: { rating: 3, elapsedSeconds: 14 } }));
		expect(response.status).toBe(200);
		expect(mockRateNote).toHaveBeenCalledWith(12, "u", 3, 14);
	});

	it("maps a missing Note to 404", async () => {
		mockRateNote.mockRejectedValue(new Error("Note not found"));
		const response = await rateNote(mockEvent({ user: { id: "u" }, params: { noteId: "12" }, body: { rating: 3, elapsedSeconds: 14 } }));
		expect(response.status).toBe(404);
	});
});
