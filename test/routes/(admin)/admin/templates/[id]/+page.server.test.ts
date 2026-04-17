import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, load } from "$routes/(admin)/admin/templates/[id]/+page.server";

// ── Mock DB ──────────────────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(() => ({ from: mockFrom })),
		update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
		insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	template: {
		id: "id",
		isActive: "isActive",
	},
	templateVariant: {
		id: "id",
		templateId: "templateId",
		isActive: "isActive",
	},
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((_col, _val) => "eq"),
	and: vi.fn((..._args) => "and"),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function createActionEvent(entries: Record<string, string>, paramsId = "1") {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}
	return {
		params: { id: paramsId },
		locals: { user: { id: "admin-1" } },
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
};

const sampleTemplate = {
	id: 1,
	ui: "imessage",
	titleBase: "Chat with {{friend}} about {{topic}}",
	shortObjectiveBase: null,
	descriptionBase: null,
	agentPromptBase: null,
	objectivesBase: null,
	isActive: true,
};

describe("Admin Templates [id] +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("load function", () => {
		it("returns 404 for non-numeric id", async () => {
			const event = { params: { id: "abc" } } as any;

			try {
				await load(event);
				expect.fail("Should have thrown");
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});
	});

	describe("save action", () => {
		it("returns 400 with field errors for invalid template data", async () => {
			const event = createActionEvent({}, "1");

			const result = (await actions.save(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.errors).toBeDefined();
			expect(result.data?.errors?.titleBase).toBeDefined();
		});

		it("returns saved: true on success", async () => {
			const event = createActionEvent(validTemplateEntries, "1");

			const result = await actions.save(event);

			expect(result).toEqual({ saved: true });
		});
	});

	describe("addVariant action", () => {
		it("returns 400 when variant is missing slot values", async () => {
			// Mock DB to return template
			const { db } = await import("$lib/server/db");
			(db.select as any).mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([sampleTemplate]),
					}),
				}),
			});

			const event = createActionEvent(
				{
					slotValues: JSON.stringify({ friend: "Alice" }), // missing topic
					openingState: JSON.stringify({ previousMessages: [] }),
				},
				"1",
			);

			const result = (await actions.addVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("missing slot values");
			expect(result.data?.message).toContain("topic");
		});

		it("returns 400 for invalid opening state", async () => {
			const { db } = await import("$lib/server/db");
			(db.select as any).mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ ...sampleTemplate, ui: "discord" }]),
					}),
				}),
			});

			const event = createActionEvent(
				{
					slotValues: JSON.stringify({ friend: "Alice", topic: "weather" }),
					openingState: JSON.stringify({ serverName: "My Server" }), // missing channelName
				},
				"1",
			);

			const result = (await actions.addVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("Invalid opening state");
		});
	});

	describe("activateVariant action", () => {
		it("returns 400 for non-numeric variantId", async () => {
			const event = createActionEvent({ variantId: "abc" }, "1");

			const result = (await actions.activateVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Invalid variant id");
		});
	});

	describe("deactivateVariant action", () => {
		it("returns 400 for non-numeric variantId", async () => {
			const event = createActionEvent({ variantId: "abc" }, "1");

			const result = (await actions.deactivateVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Invalid variant id");
		});
	});

	describe("saveVariant action", () => {
		it("returns 400 for non-numeric variantId", async () => {
			const event = createActionEvent({ variantId: "abc" }, "1");

			const result = (await actions.saveVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Invalid variant id");
		});
	});
});
