import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, load } from "$routes/(app)/contribute/+page.server";

// ── Hoisted mock factories ───────────────────────────────────────────────

const { mockInsert, mockValues } = vi.hoisted(() => {
	const mockValues = vi.fn();
	const mockInsert = vi.fn(() => ({ values: mockValues }));
	return { mockInsert, mockValues };
});

vi.mock("drizzle-orm", () => {
	const eq = vi.fn(() => "eq");
	const desc = vi.fn(() => "desc");
	return { eq, desc };
});

vi.mock("$lib/server/db", () => ({
	db: {
		insert: mockInsert,
		select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })) })),
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	templateContribution: {},
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function createEvent(entries: Record<string, string>, userId = "user-1") {
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
		url: new URL("http://localhost/contribute"),
	} as any;
}

const validEntries: Record<string, string> = {
	language: "en",
	interactionType: "chat",
	ui: "imessage",
	titleBase: "Chat with {{friend}} about {{topic}}",
	firstVariantSlotValues: JSON.stringify({ friend: "Alice", topic: "weather" }),
	firstVariantOpeningState: JSON.stringify({ previousMessages: [] }),
};

describe("Contribute +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("load", () => {
		it("redirects unauthenticated users to sign-in", async () => {
			const event = { locals: { user: null } } as any;
			await expect(load(event)).rejects.toMatchObject({
				status: 302,
				location: "/sign-in",
			});
		});

		it("redirects admin users to home", async () => {
			const event = { locals: { user: { id: "admin-1", role: "admin" } } } as any;
			await expect(load(event)).rejects.toMatchObject({
				status: 302,
				location: "/",
			});
		});

		it("returns empty contributions for authenticated learners", async () => {
			const event = { locals: { user: { id: "user-1", role: "learner" } } } as any;
			const result = (await load(event)) as { contributions: unknown[] };
			expect(result.contributions).toEqual([]);
		});
	});

	describe("default action", () => {
		it("redirects unauthenticated users", async () => {
			const event = createEvent({}, "");
			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/sign-in",
			});
		});

		it("returns 400 with field errors for empty submission", async () => {
			const event = createEvent({});
			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors).toBeDefined();
			expect(result.data?.errors?.titleBase).toBeDefined();
			expect(result.data?.errors?.language).toBeDefined();
		});

		it("creates contribution and redirects for translate type", async () => {
			const entries: Record<string, string> = {
				language: "en",
				interactionType: "translate",
				ui: "translator",
				titleBase: "Translate this",
				agentPromptBase: "a friendly letter between former colleagues",
				translationReference: "Hello\nWorld\n\nGoodbye\nMoon",
			};

			const event = createEvent(entries);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/contribute?success=1",
			});

			expect(mockInsert).toHaveBeenCalled();
			const inserted = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(inserted?.status).toBe("pending");
			expect(inserted?.createdBy).toBe("user-1");
			expect(inserted?.submittedAt).toBeInstanceOf(Date);
		});

		it("creates contribution with variant for non-translate type", async () => {
			const event = createEvent(validEntries);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/contribute?success=1",
			});

			expect(mockInsert).toHaveBeenCalled();
			const inserted = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(inserted?.status).toBe("pending");
			expect(inserted?.createdBy).toBe("user-1");
			expect(inserted?.submittedAt).toBeInstanceOf(Date);
			expect(inserted?.slotValues).toBeDefined();
			expect(inserted?.openingState).toBeDefined();
		});

		it("returns 400 when variant is missing required slots", async () => {
			const entries = {
				...validEntries,
				firstVariantSlotValues: JSON.stringify({ friend: "Alice" }), // missing topic
			};
			const event = createEvent(entries);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("missing slot values");
			expect(result.data?.message).toContain("topic");
		});

		it("returns 400 when slot values are too long", async () => {
			const entries = {
				...validEntries,
				firstVariantSlotValues: JSON.stringify({ friend: "Alice", topic: "x".repeat(10001) }),
			};
			const event = createEvent(entries);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Slot values are too long");
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("returns 400 when opening state is invalid for the UI", async () => {
			const entries = {
				...validEntries,
				ui: "discord",
				firstVariantOpeningState: JSON.stringify({ serverName: "My Server" }), // missing channelName
			};
			const event = createEvent(entries);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("Invalid opening state for discord");
		});

		it("handles empty optional fields correctly", async () => {
			const entries = {
				...validEntries,
				titleBase: "Simple title no slots",
				firstVariantSlotValues: "{}",
			};
			const event = createEvent(entries);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/contribute?success=1",
			});
		});

		it("handles invalid JSON in slot values gracefully", async () => {
			const entries = {
				...validEntries,
				titleBase: "Simple title no slots",
				firstVariantSlotValues: "not-valid-json",
			};
			const event = createEvent(entries);

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
				location: "/contribute?success=1",
			});
		});

		it("rejects interaction type / ui mismatch", async () => {
			const entries = {
				...validEntries,
				interactionType: "translate",
				// ui is "imessage" but should be "translator"
			};
			const event = createEvent(entries);

			const result = (await actions.default(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors?.ui).toBeDefined();
		});

		it("sets createdBy from different user", async () => {
			const event = createEvent(validEntries, "contributor-42");

			await expect(actions.default(event)).rejects.toMatchObject({
				status: 302,
			});

			expect(mockInsert).toHaveBeenCalled();
			const inserted = mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
			expect(inserted?.createdBy).toBe("contributor-42");
		});
	});
});
