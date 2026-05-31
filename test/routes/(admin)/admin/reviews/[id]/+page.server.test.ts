import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/server/db";
import { actions, load } from "$routes/(admin)/admin/reviews/[id]/+page.server";

// ── Hoisted mocks ────────────────────────────────────────────────────────

const { mockSelectFrom, mockUpdateWhere } = vi.hoisted(() => {
	const mockSelectFrom = vi.fn();
	const mockUpdateWhere = vi.fn();
	return { mockSelectFrom, mockUpdateWhere };
});

vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(() => ({ from: mockSelectFrom })),
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: mockUpdateWhere })),
		})),
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	templateContribution: {},
	user: {},
}));

vi.mock("drizzle-orm", () => {
	const eq = vi.fn(() => "eq");
	const and = vi.fn((...args: unknown[]) => args);
	return { and, eq };
});

// ── Helpers ──────────────────────────────────────────────────────────────

function createEvent(formEntries?: Record<string, string>, userId = "admin-1", role = "admin") {
	const formData = new FormData();
	if (formEntries) {
		for (const [key, value] of Object.entries(formEntries)) {
			formData.append(key, value);
		}
	}
	return {
		locals: { user: userId ? { id: userId, role } : null },
		params: { id: "1" },
		request: { formData: vi.fn().mockResolvedValue(formData), headers: new Headers() },
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
	});

	describe("load", () => {
		it("returns 404 for invalid id", async () => {
			const event = { locals: { user: { id: "admin-1", role: "admin" } }, params: { id: "abc" } } as any;
			await expect(load(event)).rejects.toMatchObject({ status: 404 });
		});

		it("returns 404 when contribution not found", async () => {
			const limit = vi.fn().mockResolvedValue([]);
			mockSelectFrom.mockReturnValue({ leftJoin: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) });

			const event = { locals: { user: { id: "admin-1", role: "admin" } }, params: { id: "1" } } as any;
			await expect(load(event)).rejects.toMatchObject({ status: 404 });
		});

		it("returns contribution data", async () => {
			const limit = vi.fn().mockResolvedValue([buildContribution()]);
			mockSelectFrom.mockReturnValue({ leftJoin: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) });

			const event = { locals: { user: { id: "admin-1", role: "admin" } }, params: { id: "1" } } as any;
			const result = (await load(event)) as { contribution: Record<string, unknown> };
			expect(result.contribution).toBeDefined();
		});
	});

	describe("reject action", () => {
		it("redirects unauthenticated users", async () => {
			const event = createEvent({}, "");
			await expect(actions.reject(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		});

		it("returns 403 for non-admin users", async () => {
			const event = createEvent({}, "learner-1", "learner");
			await expect(actions.reject(event)).rejects.toMatchObject({ status: 403 });
			expect(event.request.formData).not.toHaveBeenCalled();
			expect(db.select).not.toHaveBeenCalled();
			expect(db.update).not.toHaveBeenCalled();
		});

		it("rejects and redirects to reviews list", async () => {
			const limit = vi.fn().mockResolvedValue([{ status: "pending" }]);
			mockSelectFrom.mockReturnValue({ where: vi.fn(() => ({ limit })) });

			await expect(actions.reject(createEvent())).rejects.toMatchObject({
				status: 302,
				location: "/admin/reviews",
			});
		});

		it("returns 400 when contribution is already reviewed", async () => {
			const limit = vi.fn().mockResolvedValue([{ status: "approved" }]);
			mockSelectFrom.mockReturnValue({ where: vi.fn(() => ({ limit })) });

			const result = (await actions.reject(createEvent())) as any;
			expect(result.status).toBe(400);
			expect(result.data?.message).toBe("Already reviewed");
		});

		it("returns 404 when contribution not found", async () => {
			const limit = vi.fn().mockResolvedValue([]);
			mockSelectFrom.mockReturnValue({ where: vi.fn(() => ({ limit })) });

			const result = (await actions.reject(createEvent())) as any;
			expect(result.status).toBe(404);
		});
	});
});
