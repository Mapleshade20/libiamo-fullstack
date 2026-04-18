import { fail } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tasksModule from "../../../../../src/lib/server/tasks.ts";
import { actions, load } from "../../../../../src/routes/(admin)/admin/schedule/+page.server.ts";

vi.mock("../../../../src/lib/server/db.ts", () => {
	const mockQuery = {
		from: vi.fn().mockReturnThis(),
		innerJoin: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		orderBy: vi.fn().mockResolvedValue([]),
	};
	return {
		db: {
			select: vi.fn(() => mockQuery),
		},
	};
});

vi.mock("@sveltejs/kit", () => ({
	fail: vi.fn((status, data) => ({ status, data })),
}));

vi.spyOn(tasksModule, "scheduleTaskManually").mockResolvedValue();

describe("Schedule Page Server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Load Function", () => {
		const createMockEvent = (searchParams: Record<string, string>) =>
			({
				url: {
					searchParams: new URLSearchParams(searchParams),
				},
			}) as any;

		it("should parse default parameters correctly (daily mode)", async () => {
			const event = createMockEvent({});
			const result = (await load(event)) as any;

			expect(result.filters.mode).toBe("daily");
			expect(result.filters.language).toBe("en");
			expect(result.filters.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});

		it("should parse weekly mode and convert -W format to Monday date", async () => {
			const event = createMockEvent({ mode: "weekly", date: "2024-W01" });
			const result = (await load(event)) as any;

			expect(result.filters.mode).toBe("weekly");

			expect(result.filters.date).toBe("2024-01-01");
		});

		it("should recover if mode is weekly but date is daily formatted", async () => {
			const event = createMockEvent({ mode: "weekly", date: "2024-05-15" });
			const result = (await load(event)) as any;

			expect(result.filters.mode).toBe("weekly");
			expect(result.filters.rawDate).toContain("-W");
		});
	});

	describe("Actions", () => {
		it("schedule action should fail on invalid form data", async () => {
			const formData = new FormData();
			const event = { request: { formData: vi.fn().mockResolvedValue(formData) } } as any;
			await actions.schedule(event);
			expect(fail).toHaveBeenCalledWith(400, expect.any(Object));
		});

		it("schedule action should succeed with valid data", async () => {
			const formData = new FormData();
			formData.append("templateId", "1");
			formData.append("date", "2024-01-01");
			const event = { request: { formData: vi.fn().mockResolvedValue(formData) } } as any;

			const result = await actions.schedule(event);
			expect(tasksModule.scheduleTaskManually).toHaveBeenCalledWith(1, "2024-01-01");
			expect(result).toEqual({ success: true });
		});
	});
});
