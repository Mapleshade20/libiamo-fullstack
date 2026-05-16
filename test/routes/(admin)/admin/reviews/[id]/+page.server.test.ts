import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, load } from "$routes/(admin)/admin/reviews/[id]/+page.server";

// ── Hoisted mocks ────────────────────────────────────────────────────────

const { mockSelectFrom, mockInsertValues, mockUpdateWhere } = vi.hoisted(() => {
	const mockSelectFrom = vi.fn();
	const mockInsertValues = vi.fn();
	const mockUpdateWhere = vi.fn();
	return { mockSelectFrom, mockInsertValues, mockUpdateWhere };
});

vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(() => ({ from: mockSelectFrom })),
		insert: vi.fn(() => ({ values: mockInsertValues })),
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: mockUpdateWhere })),
		})),
		transaction: async (cb: any) => {
			const tx = {
				insert: vi.fn(() => ({
					values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 99 }]) })),
				})),
			};
			return cb(tx);
		},
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	templateContribution: {},
	template: { id: "id" },
	templateVariant: {},
	user: {},
}));

vi.mock("drizzle-orm", () => {
	const eq = vi.fn(() => "eq");
	return { eq };
});

// ── Helpers ──────────────────────────────────────────────────────────────

function createEvent(formEntries?: Record<string, string>, userId = "admin-1") {
	const formData = new FormData();
	if (formEntries) {
		for (const [key, value] of Object.entries(formEntries)) {
			formData.append(key, value);
		}
	}
	return {
		locals: { user: userId ? { id: userId } : null },
		params: { id: "1" },
		request: { formData: async () => formData, headers: new Headers() },
	} as any;
}

const buildContribution = (overrides: Record<string, unknown> = {}) => ({
	language: "en",
	interactionType: "chat",
	ui: "imessage",
	titleBase: "Test contribution",
	cadence: "daily",
	difficulty: 2,
	status: "pending",
	slotValues: { friend: "Bob" },
	openingState: { previousMessages: [] },
	...overrides,
});

describe("Admin Reviews [id] +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdateWhere.mockResolvedValue(undefined);
		mockInsertValues.mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 99 }]) });
	});

	describe("load", () => {
		it("returns 404 for invalid id", async () => {
			const event = { params: { id: "abc" } } as any;
			await expect(load(event)).rejects.toMatchObject({ status: 404 });
		});

		it("returns 404 when contribution not found", async () => {
			const limit = vi.fn().mockResolvedValue([]);
			mockSelectFrom.mockReturnValue({ leftJoin: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) });

			const event = { params: { id: "1" } } as any;
			await expect(load(event)).rejects.toMatchObject({ status: 404 });
		});

		it("returns contribution data", async () => {
			const limit = vi.fn().mockResolvedValue([buildContribution()]);
			mockSelectFrom.mockReturnValue({ leftJoin: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) });

			const event = { params: { id: "1" } } as any;
			const result = (await load(event)) as { contribution: Record<string, unknown> };
			expect(result.contribution).toBeDefined();
		});
	});

	describe("approve action", () => {
		it("redirects unauthenticated users", async () => {
			const event = createEvent({}, "");
			await expect(actions.approve(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		});

		it("approves and redirects to reviews list", async () => {
			const limit = vi.fn().mockResolvedValue([buildContribution()]);
			mockSelectFrom.mockReturnValue({ where: vi.fn(() => ({ limit })) });

			await expect(actions.approve(createEvent())).rejects.toMatchObject({
				status: 302,
				location: "/admin/reviews",
			});
		});
	});

	describe("reject action", () => {
		it("redirects unauthenticated users", async () => {
			const event = createEvent({}, "");
			await expect(actions.reject(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		});

		it("rejects and redirects to reviews list", async () => {
			await expect(actions.reject(createEvent())).rejects.toMatchObject({
				status: 302,
				location: "/admin/reviews",
			});
		});
	});
});
