import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateCardFromNote } = vi.hoisted(() => ({
	mockCreateCardFromNote: vi.fn(),
}));

vi.mock("$lib/server/review-cards", () => ({
	createCardFromNote: mockCreateCardFromNote,
	getDueCards: vi.fn(),
	getReviewStats: vi.fn(),
	rateCard: vi.fn(),
	noteHasCard: vi.fn(),
}));

vi.mock("$lib/server/llm", () => {
	class TrialQuotaExhaustedError extends Error {
		trialTotal = 50_000;
		trialTokensLeft = 0;
	}
	return {
		TrialQuotaExhaustedError,
		trialQuotaExhaustedData: (error: TrialQuotaExhaustedError) => ({ error: error.message, quotaExhausted: true }),
		withPendingQuotaNotice: async (_userId: string, data: Record<string, unknown>) => data,
	};
});

import { POST as rateCard } from "../../../src/routes/api/review/[cardId]/rate/+server";
import { POST as createCard } from "../../../src/routes/api/review/create-card/+server";
import { GET as dueCards } from "../../../src/routes/api/review/due/+server";
import { GET as stats } from "../../../src/routes/api/review/stats/+server";

function mockEvent(overrides: { user?: unknown; body?: unknown; params?: Record<string, string> }) {
	return {
		locals: { user: overrides.user ?? null },
		request: {
			json: async () => overrides.body ?? {},
		},
		params: overrides.params ?? {},
	} as any;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/review/create-card", () => {
	it("returns 401 when unauthenticated", async () => {
		const res = await createCard(mockEvent({ user: null }));
		expect(res.status).toBe(401);
	});

	it("returns 400 for invalid body", async () => {
		const res = await createCard(mockEvent({ user: { id: "u" }, body: { noteId: "abc" } }));
		expect(res.status).toBe(400);
	});

	it("creates card successfully", async () => {
		mockCreateCardFromNote.mockResolvedValueOnce({ created: true });
		const res = await createCard(mockEvent({ user: { id: "u" }, body: { noteId: 1 } }));
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data.created).toBe(true);
	});
});

describe("GET /api/review/due", () => {
	it("returns 401 when unauthenticated", async () => {
		const res = await dueCards(mockEvent({ user: null }));
		expect(res.status).toBe(401);
	});
});

describe("GET /api/review/stats", () => {
	it("returns 401 when unauthenticated", async () => {
		const res = await stats(mockEvent({ user: null }));
		expect(res.status).toBe(401);
	});
});

describe("POST /api/review/[cardId]/rate", () => {
	it("returns 401 when unauthenticated", async () => {
		const res = await rateCard(mockEvent({ user: null }));
		expect(res.status).toBe(401);
	});

	it("returns 400 for invalid cardId", async () => {
		const res = await rateCard(mockEvent({ user: { id: "u" }, params: { cardId: "xyz" } }));
		expect(res.status).toBe(400);
	});
});
