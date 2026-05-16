import { beforeEach, describe, expect, it, vi } from "vitest";
import { load } from "$routes/(admin)/admin/reviews/+page.server";

const { mockSelectFrom } = vi.hoisted(() => {
	const mockSelectFrom = vi.fn();
	return { mockSelectFrom };
});

vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(() => ({ from: mockSelectFrom })),
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	templateContribution: {},
	user: {},
}));

vi.mock("drizzle-orm", () => {
	const eq = vi.fn(() => "eq");
	return { eq };
});

describe("Admin Reviews +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("queries pending contributions", async () => {
		const orderBy = vi.fn().mockResolvedValue([]);
		const where = vi.fn(() => ({ orderBy }));
		mockSelectFrom.mockReturnValue({ leftJoin: vi.fn(() => ({ where })) });

		const result = (await load({} as any)) as { pendingContributions: unknown[] };
		expect(result.pendingContributions).toEqual([]);
	});
});
