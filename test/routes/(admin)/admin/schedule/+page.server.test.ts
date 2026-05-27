import { fail } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as tasksModule from "$lib/server/tasks";
import { actions, load } from "$routes/(admin)/admin/schedule/+page.server";

vi.mock("$lib/server/db", () => {
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

vi.mock("$lib/server/db/schema", () => ({
	task: { id: "id", title: "title", date: "date", origin: "origin", language: "language", templateId: "templateId", cadence: "cadence" },
	template: { id: "id", titleBase: "titleBase", interactionType: "interactionType", cadence: "cadence", isActive: "isActive", language: "language" },
}));

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

vi.spyOn(tasksModule, "scheduleTaskManually").mockResolvedValue();

describe("Schedule Page Server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("Load Function", () => {
		const createMockEvent = (searchParams: Record<string, string>) =>
			({
				locals: { user: { id: "admin-1", role: "admin" } },
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

		it("should recover if mode is daily but date is weekly formatted", async () => {
			const event = createMockEvent({ mode: "daily", date: "2024-W01" });
			const result = (await load(event)) as any;

			expect(result.filters.mode).toBe("daily");
			expect(result.filters.date).not.toContain("-W");
		});
	});

	describe("Actions", () => {
		it("schedule action should return 403 for non-admin users", async () => {
			const formData = new FormData();
			formData.append("templateId", "1");
			formData.append("date", "2024-01-01");
			const event = {
				locals: { user: { id: "learner-1", role: "learner" } },
				request: { formData: vi.fn().mockResolvedValue(formData) },
			} as any;

			await expect(actions.schedule(event)).rejects.toMatchObject({ status: 403 });
		});

		it("schedule action should fail on invalid form data", async () => {
			const formData = new FormData();
			const event = {
				locals: { user: { id: "admin-1", role: "admin" } },
				request: { formData: vi.fn().mockResolvedValue(formData) },
			} as any;

			await actions.schedule(event);
			expect(fail).toHaveBeenCalledWith(400, expect.any(Object));
		});

		it("schedule action should succeed with valid data", async () => {
			const formData = new FormData();
			formData.append("templateId", "1");
			formData.append("date", "2024-01-01");
			const event = {
				locals: { user: { id: "admin-1", role: "admin" } },
				request: { formData: vi.fn().mockResolvedValue(formData) },
			} as any;

			const result = await actions.schedule(event);

			expect(tasksModule.scheduleTaskManually).toHaveBeenCalledWith(1, "2024-01-01");
			expect(result).toEqual({ success: true });
		});

		it("schedule action should catch errors and return fail 400", async () => {
			const formData = new FormData();
			formData.append("templateId", "1");
			formData.append("date", "2024-01-01");
			const event = {
				locals: { user: { id: "admin-1", role: "admin" } },
				request: { formData: vi.fn().mockResolvedValue(formData) },
			} as any;

			vi.mocked(tasksModule.scheduleTaskManually).mockRejectedValueOnce(new Error("Database connection lost"));

			await actions.schedule(event);

			expect(fail).toHaveBeenCalledWith(
				400,
				expect.objectContaining({
					message: "Database connection lost",
				}),
			);
		});
	});
});
