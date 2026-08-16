import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbSelectQueue, mockDb } = vi.hoisted(() => {
	const dbSelectQueue: unknown[][] = [];
	const mockDb = {
		select: vi.fn(() => {
			const chain = Promise.resolve(dbSelectQueue.shift() ?? []) as Promise<unknown[]> & {
				from: ReturnType<typeof vi.fn>;
				where: ReturnType<typeof vi.fn>;
				limit: ReturnType<typeof vi.fn>;
			};
			chain.from = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.limit = vi.fn(() => chain);
			return chain;
		}),
	};
	return { dbSelectQueue, mockDb };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/db/schema", () => ({
	task: { id: "task.id", templateId: "task.templateId", variantId: "task.variantId" },
	template: { id: "template.id" },
	translationSourceSet: { id: "translationSourceSet.id", templateId: "translationSourceSet.templateId" },
}));
vi.mock("drizzle-orm", () => ({
	eq: vi.fn((column, value) => ({ column, value })),
}));

import { checkTemplateDeletionSafety, checkTemplateVariantDeletionSafety } from "$lib/server/admin/template-deletion";

describe("template deletion safety", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbSelectQueue.length = 0;
	});

	it("allows deleting an unused variant", async () => {
		dbSelectQueue.push([]);

		const result = await checkTemplateVariantDeletionSafety(7);

		expect(result).toEqual({ safe: true });
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	it("blocks deleting a variant with scheduled tasks or practice history", async () => {
		dbSelectQueue.push([{ id: 42 }]);

		const result = await checkTemplateVariantDeletionSafety(7);

		expect(result.safe).toBe(false);
		if (!result.safe) expect(result.message).toContain("practice history");
	});

	it("blocks deleting a missing template", async () => {
		dbSelectQueue.push([]);

		const result = await checkTemplateDeletionSafety(99);

		expect(result).toEqual({ safe: false, message: "Template not found." });
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	it("blocks deleting a template with scheduled tasks or practice history", async () => {
		dbSelectQueue.push([{ id: 1 }]);
		dbSelectQueue.push([{ id: 10 }]);

		const result = await checkTemplateDeletionSafety(1);

		expect(result.safe).toBe(false);
		if (!result.safe) expect(result.message).toContain("scheduled tasks");
		expect(mockDb.select).toHaveBeenCalledTimes(2);
	});

	it("blocks deleting a template with translation attempts", async () => {
		dbSelectQueue.push([{ id: 1 }]);
		dbSelectQueue.push([]);
		dbSelectQueue.push([{ id: 20 }]);

		const result = await checkTemplateDeletionSafety(1);

		expect(result.safe).toBe(false);
		if (!result.safe) expect(result.message).toContain("translation attempts");
		expect(mockDb.select).toHaveBeenCalledTimes(3);
	});

	it("allows deleting a template when the template has no scheduled tasks or translation attempts", async () => {
		dbSelectQueue.push([{ id: 1 }]);
		dbSelectQueue.push([]);
		dbSelectQueue.push([]);

		const result = await checkTemplateDeletionSafety(1);

		expect(result).toEqual({ safe: true });
		expect(mockDb.select).toHaveBeenCalledTimes(3);
	});
});
