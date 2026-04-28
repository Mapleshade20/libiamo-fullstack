import { describe, expect, it, vi } from "vitest";
import { load } from "$routes/(app)/translate/+page.server";

const { mockOrderBy, mockWhere, mockSelect } = vi.hoisted(() => {
	const mockOrderBy = vi.fn<() => any>();
	const mockWhere = vi.fn<() => any>(() => ({ orderBy: mockOrderBy }));
	const mockFrom = vi.fn<() => any>(() => ({ where: mockWhere }));
	const mockSelect = vi.fn<() => any>(() => ({ from: mockFrom }));
	return { mockOrderBy, mockWhere, mockFrom, mockSelect };
});

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
		templateId: "templateId",
		status: "status",
		userId: "userId",
		updatedAt: "updatedAt",
	},
}));

describe("(app) translate +page.server", () => {
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

		const user = { id: "u1", activeLanguage: "en" };
		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.templates).toEqual(templates);
		expect(result.language).toBe("en");
		expect(result.statusMap).toEqual({});
	});

	it("returns empty array when no translator templates exist", async () => {
		// First query: templates (empty)
		mockWhere.mockResolvedValueOnce([]);
		// Second query: attempts (has orderBy chain)
		mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
		mockOrderBy.mockResolvedValueOnce([]);

		const user = { id: "u1", activeLanguage: "ja" };
		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.templates).toEqual([]);
		expect(result.language).toBe("ja");
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

		const user = { id: "u1", activeLanguage: "en" };
		const result = (await load({ locals: { user } } as any)) as any;

		expect(result.statusMap).toEqual({ 1: "evaluated", 2: "submitted" });
	});
});
