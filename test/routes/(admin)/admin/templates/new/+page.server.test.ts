import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, load } from "$routes/(admin)/admin/templates/new/+page.server";

// ── Hoisted mock factories ───────────────────────────────────────────────

const { mockReturning, mockValues, mockTransaction, mockUpdateWhere, mockSelectLimit } = vi.hoisted(() => {
	const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
	const mockValues = vi.fn(() => ({ returning: mockReturning }));
	const mockTransaction = vi.fn();
	const mockUpdateWhere = vi.fn();
	const mockSelectLimit = vi.fn();
	return { mockReturning, mockValues, mockTransaction, mockUpdateWhere, mockSelectLimit };
});

vi.mock("$lib/server/db", () => ({
	db: {
		insert: vi.fn(() => ({ values: mockValues })),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: mockUpdateWhere })) })),
		select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: mockSelectLimit })) })) })),
		transaction: async (cb: any) => {
			const tx = {
				insert: vi.fn(() => ({ values: mockValues })),
				update: vi.fn(() => ({ set: vi.fn(() => ({ where: mockUpdateWhere })) })),
			};
			mockTransaction(cb);
			return cb(tx);
		},
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	template: { id: "id" },
	templateContribution: { id: "id" },
	templateVariant: {},
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function createEvent(entries: Record<string, string>, userId = "admin-1") {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}
	return {
		locals: { user: userId ? { id: userId } : null },
		request: {
			formData: async () => formData,
			headers: new Headers(),
		},
	} as any;
}

const validTemplateEntries: Record<string, string> = {
	language: "en",
	interactionType: "chat",
	ui: "imessage",
	cadence: "daily",
	difficulty: "1",
	pointReward: "10",
	gemReward: "5",
	titleBase: "Chat with {{friend}} about {{topic}}",
	isActive: "on",
	firstVariantSlotValues: JSON.stringify({ friend: "Alice", topic: "weather" }),
	firstVariantOpeningState: JSON.stringify({ previousMessages: [] }),
};

describe("Admin Templates New +page.server", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockReturning.mockResolvedValue([{ id: 1 }]);
		mockUpdateWhere.mockResolvedValue(undefined);
		mockSelectLimit.mockResolvedValue([]);
	});

	describe("load", () => {
		it("returns null contributionData when no fromContribution param", async () => {
			const event = { url: { searchParams: new URLSearchParams() } } as any;
			const result = (await load(event)) as { contributionData: unknown };
			expect(result.contributionData).toBeNull();
		});

		it("returns null contributionData when fromContribution is NaN", async () => {
			const event = { url: { searchParams: new URLSearchParams("fromContribution=abc") } } as any;
			const result = (await load(event)) as { contributionData: unknown };
			expect(result.contributionData).toBeNull();
		});

		it("returns contribution data when fromContribution is valid", async () => {
			mockSelectLimit.mockResolvedValue([{ id: 5, titleBase: "Test" }]);
			const event = { url: { searchParams: new URLSearchParams("fromContribution=5") } } as any;
			const result = (await load(event)) as { contributionData: Record<string, unknown> };
			expect(result.contributionData).toBeDefined();
		});
	});

	describe("default action", () => {
		it("returns 400 with field errors for invalid template data", async () => {
			const event = createEvent({});
			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors).toBeDefined();
			expect(result.data?.errors?.titleBase).toBeDefined();
			expect(result.data?.errors?.language).toBeDefined();
		});

		it("returns 401 when user is not authenticated", async () => {
			const event = createEvent(validTemplateEntries, "");
			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(401);
		});

		it("returns 400 when first variant is missing slot values", async () => {
			const entries = {
				...validTemplateEntries,
				firstVariantSlotValues: JSON.stringify({ friend: "Alice" }),
			};
			const event = createEvent(entries);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("missing slot values");
			expect(result.data?.message).toContain("topic");
		});

		it("returns 400 when opening state is invalid for UI type", async () => {
			const entries = {
				...validTemplateEntries,
				ui: "discord",
				firstVariantOpeningState: JSON.stringify({ serverName: "My Server" }),
			};
			const event = createEvent(entries);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("Invalid opening state for discord");
		});

		it("creates template and redirects on success", async () => {
			const event = createEvent(validTemplateEntries);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/admin/templates",
			});

			expect(mockTransaction).toHaveBeenCalled();
		});

		it("marks contribution as approved when fromContributionId is provided", async () => {
			mockSelectLimit.mockResolvedValueOnce([{ status: "pending" }]);

			const entries = {
				...validTemplateEntries,
				fromContributionId: "5",
			};
			const event = createEvent(entries);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/admin/templates",
			});

			expect(mockTransaction).toHaveBeenCalled();
		});

		it("returns 404 when fromContributionId does not exist", async () => {
			const entries = {
				...validTemplateEntries,
				fromContributionId: "999",
			};
			const event = createEvent(entries);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(404);
		});

		it("returns 400 when contribution is already reviewed", async () => {
			mockSelectLimit.mockResolvedValueOnce([{ status: "approved" }]);

			const entries = {
				...validTemplateEntries,
				fromContributionId: "5",
			};
			const event = createEvent(entries);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Already reviewed");
		});

		it("handles empty optional fields correctly", async () => {
			const entries = {
				...validTemplateEntries,
				titleBase: "Simple chat",
				firstVariantSlotValues: "{}",
			};
			const event = createEvent(entries);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/admin/templates",
			});
		});

		it("handles invalid JSON in slot values gracefully", async () => {
			const entries = {
				...validTemplateEntries,
				titleBase: "Simple chat",
				firstVariantSlotValues: "not-valid-json",
			};
			const event = createEvent(entries);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/admin/templates",
			});
		});
	});
});
