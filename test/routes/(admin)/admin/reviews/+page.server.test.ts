import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, load } from "$routes/(admin)/admin/reviews/+page.server";

// ── Hoisted mock factories ───────────────────────────────────────────────

const { mockSelectFrom, mockInsertValues, mockUpdateWhere, mockTransactionFn } = vi.hoisted(() => {
	const mockSelectFrom = vi.fn();
	const mockInsertValues = vi.fn();
	const mockUpdateWhere = vi.fn();
	const mockTransactionFn = vi.fn();
	return { mockSelectFrom, mockInsertValues, mockUpdateWhere, mockTransactionFn };
});

vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(() => ({ from: mockSelectFrom })),
		insert: vi.fn(() => ({ values: mockInsertValues })),
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: mockUpdateWhere })),
		})),
		transaction: async (cb: any) => {
			mockTransactionFn();
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
		request: { formData: async () => formData, headers: new Headers() },
	} as any;
}

describe("Admin Reviews +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default: update operations resolve successfully
		mockUpdateWhere.mockResolvedValue(undefined);
		mockInsertValues.mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 99 }]) });
	});

	describe("load", () => {
		it("queries pending contributions and returns them", async () => {
			const orderBy = vi.fn().mockResolvedValue([]);
			const where = vi.fn(() => ({ orderBy }));
			mockSelectFrom.mockReturnValue({ leftJoin: vi.fn(() => ({ where })) });

			const result = (await load({} as any)) as { pendingContributions: unknown[] };
			expect(result.pendingContributions).toEqual([]);
		});
	});

	describe("approve action", () => {
		it("redirects unauthenticated users", async () => {
			const event = createEvent({ id: "1" }, "");
			await expect(actions.approve(event)).rejects.toMatchObject({
				status: 302,
				location: "/sign-in",
			});
		});

		it("returns 400 for NaN id", async () => {
			const event = createEvent({ id: "abc" });
			const result = (await actions.approve(event)) as ActionFailure<any>;
			expect(result.status).toBe(400);
		});

		it("returns 404 when contribution not found", async () => {
			const limit = vi.fn().mockResolvedValue([]);
			const where = vi.fn(() => ({ limit }));
			mockSelectFrom.mockReturnValue({ where });

			const event = createEvent({ id: "1" });
			const result = (await actions.approve(event)) as ActionFailure<any>;
			expect(result.status).toBe(404);
		});
	});

	describe("reject action", () => {
		it("redirects unauthenticated users", async () => {
			const event = createEvent({ id: "1" }, "");
			await expect(actions.reject(event)).rejects.toMatchObject({
				status: 302,
				location: "/sign-in",
			});
		});

		it("rejects contribution and returns result", async () => {
			const event = createEvent({ id: "1" });
			const result = await actions.reject(event);
			expect(result).toEqual({ rejected: 1 });
		});
	});
});
