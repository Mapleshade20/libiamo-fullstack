import { beforeEach, describe, expect, it, vi } from "vitest";
import { actions, load } from "$routes/(admin)/admin/templates/+page.server";

// ── 1. Mock SvelteKit ──────────────────────────────────────────────────
vi.mock("@sveltejs/kit", () => ({
	fail: vi.fn((status, data) => ({ status, data })),
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
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn().mockResolvedValue(undefined),
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
		url: {
			searchParams: new URLSearchParams(searchParams),
		},
	} as any;
}

function createActionEvent(formDataEntries: Record<string, string>) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(formDataEntries)) {
		formData.append(key, value);
	}
	return {
		request: {
			formData: async () => formData,
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

	// --- Actions Coverage (Testing toggleActive logic) ---
	describe("actions.toggleActive", () => {
		it("returns 400 failure when template ID is missing or invalid", async () => {
			const event = createActionEvent({ id: "invalid-id", isActive: "true" });
			const result = (await (actions as any).toggleActive(event)) as any;

			expect(result.status).toBe(400);
			expect(result.data.message).toBe("Invalid template id");
		});

		it("toggles active state from true to false successfully", async () => {
			const event = createActionEvent({ id: "1", isActive: "true" });
			const result = await (actions as any).toggleActive(event);

			// The DB update mock was called, and it returns true
			expect(result).toEqual({ toggled: true });
		});

		it("toggles active state from false to true successfully", async () => {
			const event = createActionEvent({ id: "2", isActive: "false" });
			const result = await (actions as any).toggleActive(event);

			expect(result).toEqual({ toggled: true });
		});
	});
});
