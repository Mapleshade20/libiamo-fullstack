import { describe, expect, it, vi } from "vitest";
import { load } from "$routes/(app)/translate/+page.server";

const { mockWhere, mockSelect } = vi.hoisted(() => {
	const mockWhere = vi.fn();
	const mockFrom = vi.fn(() => ({ where: mockWhere }));
	const mockSelect = vi.fn(() => ({ from: mockFrom }));
	return { mockWhere, mockFrom, mockSelect };
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
		mockWhere.mockResolvedValueOnce(templates);

		const user = { id: "u1", activeLanguage: "en" };
		const result = await load({ locals: { user } } as any);

		expect(result).toEqual({
			templates,
			language: "en",
		});
	});

	it("returns empty array when no translator templates exist", async () => {
		mockWhere.mockResolvedValueOnce([]);

		const user = { id: "u1", activeLanguage: "ja" };
		const result = await load({ locals: { user } } as any);

		expect(result).toEqual({
			templates: [],
			language: "ja",
		});
	});
});
