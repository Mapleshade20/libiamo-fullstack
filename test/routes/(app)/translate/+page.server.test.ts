import { beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "$routes/(app)/translate/+page.server";

const { mockAnd, mockEq, mockOrderBy, mockWhere, mockSelect } = vi.hoisted(() => {
	const mockAnd = vi.fn((...conditions: unknown[]) => ({ operator: "and", conditions }));
	const mockEq = vi.fn((left: unknown, right: unknown) => ({ operator: "eq", left, right }));
	const mockOrderBy = vi.fn<() => any>();
	const mockWhere = vi.fn<() => any>(() => ({ orderBy: mockOrderBy }));
	const mockFrom = vi.fn<() => any>(() => ({ where: mockWhere, innerJoin: vi.fn(() => ({ where: mockWhere })) }));
	const mockSelect = vi.fn<() => any>(() => ({ from: mockFrom }));
	return { mockAnd, mockEq, mockOrderBy, mockWhere, mockFrom, mockSelect };
});

vi.mock("drizzle-orm", () => ({
	and: mockAnd,
	desc: vi.fn((column: unknown) => ({ operator: "desc", column })),
	eq: mockEq,
}));

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	template: {
		id: "id",
		titleBase: "titleBase",
		shortObjectiveBase: "shortObjectiveBase",
		difficulty: "difficulty",
		interactionType: "interactionType",
		language: "language",
		ui: "ui",
		isActive: "isActive",
	},
	translationAttempt: {
		sourceSetId: "sourceSetId",
		status: "status",
		userId: "userId",
		updatedAt: "updatedAt",
	},
	translationSourceSet: { id: "sourceSet.id", templateId: "sourceSet.templateId", promptLanguage: "sourceSet.promptLanguage" },
}));

describe("(app) translate +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects unauthenticated users", async () => {
		await expect(load({ locals: { user: null } } as any)).rejects.toMatchObject({
			status: 302,
			location: "/sign-in",
		});
	});

	it("loads translator templates for active language", async () => {
		const templates = [{ id: 1, titleBase: "Translate a Poem", shortObjectiveBase: "Translate a poem", difficulty: 2, interactionType: "translate" }];

		// First query: templates (no orderBy, resolves directly)
		mockWhere.mockResolvedValueOnce(templates);
		// Second query: attempts (has orderBy, returns chain)
		mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValueOnce([]);

		const user = { id: "u1", activeLanguage: "en", nativeLanguage: "fr" };
		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.templates).toEqual(templates);
		expect(result.statusMap).toEqual({});
		expect(mockAnd).toHaveBeenLastCalledWith(
			{ operator: "eq", left: "userId", right: "u1" },
			{ operator: "eq", left: "sourceSet.promptLanguage", right: "fr" },
		);
	});

	it("returns empty array when no translator templates exist", async () => {
		// First query: templates (empty)
		mockWhere.mockResolvedValueOnce([]);
		// Second query: attempts (has orderBy chain)
		mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValueOnce([]);

		const user = { id: "u1", activeLanguage: "ja", nativeLanguage: "en" };
		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.templates).toEqual([]);
		expect(result.statusMap).toEqual({});
	});

	it("builds statusMap from latest attempts (deduplicates older ones)", async () => {
		const templates = [{ id: 1, titleBase: "T1", shortObjectiveBase: "S1", difficulty: 1, interactionType: "translate" }];

		// First query: templates
		mockWhere.mockResolvedValueOnce(templates);
		// Second query: attempts — includes duplicate templateId entries (older + newer)
		mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValueOnce([
			{ templateId: 1, status: "evaluated" },
			{ templateId: 1, status: "draft" }, // older, should be ignored
			{ templateId: 2, status: "submitted" },
		]);

		const user = { id: "u1", activeLanguage: "en", nativeLanguage: "fr" };
		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.statusMap).toEqual({ 1: "evaluated", 2: "submitted" });
	});

	it("does not reuse attempt statuses when native language is unset", async () => {
		const templates = [{ id: 1, titleBase: "T1", shortObjectiveBase: "S1", difficulty: 1, interactionType: "translate" }];
		mockWhere.mockResolvedValueOnce(templates);

		const user = { id: "u1", activeLanguage: "en", nativeLanguage: null };
		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.statusMap).toEqual({});
		expect(mockSelect).toHaveBeenCalledTimes(1);
	});
});
