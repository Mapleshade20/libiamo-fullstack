import { beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "$routes/(admin)/admin/templates/+page.server";

// ── 1. Mock SvelteKit ──────────────────────────────────────────────────
vi.mock("@sveltejs/kit", () => ({
	error: vi.fn((status, body) => {
		const error = new Error(typeof body === "string" ? body : "Error");
		(error as any).status = status;
		throw error;
	}),
	fail: vi.fn((status, data) => ({ status, data })),
	redirect: vi.fn((status, location) => {
		const error = new Error("Redirect");
		(error as any).status = status;
		(error as any).location = location;
		throw error;
	}),
}));

// ── 2. Mock Drizzle Database & Schema ──────────────────────────────────
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();

vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: mockWhere.mockReturnThis(),
				orderBy: mockOrderBy.mockResolvedValue([{ id: 1, titleBase: "Test Template" }]),
			})),
		})),
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	template: {
		id: "id",
		language: "language",
		interactionType: "interactionType",
		isActive: "isActive",
	},
}));

// Mock Drizzle operators to return predictable strings/objects for tracking
vi.mock("drizzle-orm", () => ({
	eq: vi.fn((col, val) => `eq(${col},${val})`),
	and: vi.fn((...args) => `and(${args.join(",")})`),
}));

// ── 3. Helpers ─────────────────────────────────────────────────────────
function createLoadEvent(searchParams: Record<string, string>) {
	return {
		locals: { user: { id: "admin-1", role: "admin" } },
		url: {
			searchParams: new URLSearchParams(searchParams),
		},
	} as any;
}

// ── 4. Test Suites ─────────────────────────────────────────────────────
describe("Admin Templates +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// --- Load Function Coverage (Testing all URL Param Branches) ---
	describe("load function", () => {
		it("returns 403 for non-admin users", async () => {
			const event = createLoadEvent({});
			event.locals.user.role = "learner";

			await expect(load(event)).rejects.toMatchObject({ status: 403 });
		});

		it("fetches templates without conditions when no filters are applied", async () => {
			const event = createLoadEvent({});
			const result = (await load(event)) as any;

			// Expect where to be called with undefined because conditions array is empty
			expect(mockWhere).toHaveBeenCalledWith(undefined);
			expect(result.filters).toEqual({ language: null, interactionType: null, active: null });
		});

		it("applies the language condition correctly", async () => {
			const event = createLoadEvent({ language: "en" });
			await load(event);

			// Expect the 'and' wrapper around the 'eq' condition
			expect(mockWhere).toHaveBeenCalledWith(expect.stringContaining("eq(language,en)"));
		});

		it("applies the interactionType condition correctly", async () => {
			const event = createLoadEvent({ interactionType: "chat" });
			await load(event);

			expect(mockWhere).toHaveBeenCalledWith(expect.stringContaining("eq(interactionType,chat)"));
		});

		it("applies the active=true condition correctly", async () => {
			const event = createLoadEvent({ active: "true" });
			await load(event);

			expect(mockWhere).toHaveBeenCalledWith(expect.stringContaining("eq(isActive,true)"));
		});

		it("applies the active=false condition correctly", async () => {
			const event = createLoadEvent({ active: "false" });
			await load(event);

			expect(mockWhere).toHaveBeenCalledWith(expect.stringContaining("eq(isActive,false)"));
		});

		it("combines multiple conditions properly using AND", async () => {
			const event = createLoadEvent({ language: "zh", active: "true" });
			const result = (await load(event)) as any;

			// Ensures the 'and' function combined both constraints
			expect(mockWhere).toHaveBeenCalledWith(expect.stringContaining("eq(language,zh)"));
			expect(mockWhere).toHaveBeenCalledWith(expect.stringContaining("eq(isActive,true)"));
			expect(result.filters.language).toBe("zh");
		});
	});
});
