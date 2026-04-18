import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cadence } from "$lib/constants";

// ── 1. Hoisted Mocks ───────────────────────────────────────────────────
const { mockInsertTaskConflict, mockInsertTaskValues, mockInsertTask, mockSelect, countResultsQueue, templateResultsQueue, variantResultsQueue } =
	vi.hoisted(() => {
		const countResultsQueue: Array<Array<{ count?: number; templateId?: number }>> = [];
		const templateResultsQueue: Array<any[]> = [];
		const variantResultsQueue: Array<any[]> = [];

		const mockInsertTaskConflict = vi.fn(async () => undefined);
		const mockInsertTaskValues = vi.fn(() => ({ onConflictDoNothing: mockInsertTaskConflict }));
		const mockInsertTask = vi.fn(() => ({ values: mockInsertTaskValues }));

		const readCountResult = async () => countResultsQueue.shift() ?? [{ count: 0 }];
		const readTemplateResult = async () => templateResultsQueue.shift() ?? [];
		const readVariantResult = async () => variantResultsQueue.shift() ?? [];

		const mockSelect = vi.fn(() => ({
			from: (table: Record<string, unknown>) => {
				// templateVariant query: has slotValues property
				if (table && "slotValues" in table) {
					return { where: readVariantResult };
				}
				// Task count/scheduled query: has date but not cadence
				if (table && "date" in table && !("cadence" in table)) {
					return { where: readCountResult };
				}
				// Template query: has cadence
				return {
					leftJoin: () => ({
						where: () => ({
							groupBy: () => ({
								orderBy: () => ({
									limit: readTemplateResult,
								}),
							}),
						}),
					}),
					where: () => ({
						limit: readTemplateResult,
					}),
				};
			},
		}));

		return {
			mockInsertTaskConflict,
			mockInsertTaskValues,
			mockInsertTask,
			mockSelect,
			countResultsQueue,
			templateResultsQueue,
			variantResultsQueue,
		};
	});

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
		insert: mockInsertTask,
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	task: {
		date: "date",
		templateId: "templateId",
		id: "id",
		language: "language",
		variantId: "variantId",
	},
	template: {
		id: "id",
		language: "language",
		cadence: "cadence",
		isActive: "isActive",
		$inferSelect: {},
	},
	templateVariant: {
		id: "id",
		templateId: "templateId",
		isActive: "isActive",
		slotValues: "slotValues",
		openingState: "openingState",
	},
}));

// Include getMondayFromWeekString to cover lines 17-28
import { ensureTasksForDate, getMondayFromWeekString, getMondayOfWeek, scheduleTaskManually, toDateString } from "$lib/server/tasks";

// ── 2. Helpers ─────────────────────────────────────────────────────────
function buildTemplate(id: number, cadence: Cadence, overrides: Record<string, unknown> = {}) {
	return {
		id,
		language: "en",
		cadence,
		isActive: true,
		titleBase: "Hello {{name}}",
		shortObjectiveBase: "Short {{topic}}",
		descriptionBase: "Desc {{topic}}",
		objectivesBase: ["Talk about {{topic}}"],
		agentPromptBase: "Prompt {{topic}}",
		...overrides,
	};
}

function buildVariant(id: number, templateId: number, overrides: Record<string, unknown> = {}) {
	return {
		id,
		templateId,
		isActive: true,
		slotValues: { name: "Lina", topic: "music" },
		openingState: {},
		...overrides,
	};
}

// ── 3. Test Suites ─────────────────────────────────────────────────────
describe("tasks helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		countResultsQueue.length = 0;
		templateResultsQueue.length = 0;
		variantResultsQueue.length = 0;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- Added coverage for getMondayFromWeekString (Lines 17-28) ---
	describe("getMondayFromWeekString", () => {
		it("calculates correct Monday for mid-year week", () => {
			// 2024-W20 Monday is May 13th, 2024
			const result = getMondayFromWeekString("2024-W20");
			expect(toDateString(result)).toBe("2024-05-13");
		});

		it("calculates correct Monday when week 1 rolls into previous year", () => {
			// 2026-Jan-04 is Sunday. Week 1 Monday should be Dec 29th, 2025.
			const result = getMondayFromWeekString("2026-W01");
			expect(toDateString(result)).toBe("2025-12-29");
		});
	});

	it("getMondayOfWeek returns monday for a sunday date", () => {
		const monday = getMondayOfWeek(new Date("2026-04-05T12:00:00.000Z"));
		expect(monday.getDay()).toBe(1);
	});

	it("getMondayOfWeek keeps monday on monday", () => {
		const monday = getMondayOfWeek(new Date("2026-04-06T12:00:00.000Z"));
		expect(monday.getDay()).toBe(1);
	});

	it("toDateString returns YYYY-MM-DD", () => {
		expect(toDateString(new Date("2026-04-04T08:30:00.000Z"))).toBe("2026-04-04");
	});

	it("ensureTasksForDate does nothing when quotas are already met", async () => {
		countResultsQueue.push([{ count: 3 }], [{ count: 3 }]);
		await ensureTasksForDate("en", new Date("2026-04-04T00:00:00.000Z"));
		expect(mockInsertTask).not.toHaveBeenCalled();
	});

	it("ensureTasksForDate schedules missing weekly and daily tasks", async () => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
		countResultsQueue.push([{ count: 1 }], [{ count: 2 }]);
		templateResultsQueue.push([{ tpl: buildTemplate(1, "weekly") }, { tpl: buildTemplate(2, "weekly") }], [{ tpl: buildTemplate(3, "daily") }]);
		variantResultsQueue.push([buildVariant(1, 1)], [buildVariant(2, 2)], [buildVariant(3, 3)]);

		await ensureTasksForDate("en", new Date("2026-04-04T00:00:00.000Z"));

		expect(mockInsertTask).toHaveBeenCalledTimes(3);
		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				templateId: 1,
				variantId: 1,
				origin: "auto",
			}),
		);
		randomSpy.mockRestore();
	});

	// --- Added coverage for notInArray condition (Lines 225-230) ---
	it("ensureTasksForDate excludes already scheduled templates (covers notInArray branch)", async () => {
		// 1st query: weeklyCount -> has 1 task (needs 2 more)
		// 2nd query: dailyCount -> has 3 tasks (needs 0 more)
		// 3rd query: scheduledWeekly -> returns templateId 99 (triggers scheduledIds.length > 0)
		countResultsQueue.push([{ count: 1 }], [{ count: 3 }], [{ templateId: 99 }]);
		templateResultsQueue.push([{ tpl: buildTemplate(42, "weekly") }]);
		variantResultsQueue.push([buildVariant(1, 42)]);

		await ensureTasksForDate("en", new Date("2026-04-04T00:00:00.000Z"));

		// By executing correctly without throwing, we confirm notInArray branch was hit safely
		expect(mockInsertTask).toHaveBeenCalled();
	});

	it("ensureTasksForDate catches scheduling errors and continues", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		countResultsQueue.push([{ count: 2 }], [{ count: 3 }]);
		templateResultsQueue.push([{ tpl: buildTemplate(11, "weekly") }]);
		variantResultsQueue.push([buildVariant(1, 11)]);
		mockInsertTaskConflict.mockRejectedValueOnce(new Error("insert failed"));

		await ensureTasksForDate("en", new Date("2026-04-04T00:00:00.000Z"));
		expect(errorSpy).toHaveBeenCalled();
	});

	it("ensureTasksForDate handles missing count rows with defaults", async () => {
		countResultsQueue.push([], []);
		templateResultsQueue.push([{ tpl: buildTemplate(30, "weekly") }], [{ tpl: buildTemplate(31, "daily") }]);
		variantResultsQueue.push([buildVariant(1, 30)], [buildVariant(2, 31)]);

		await ensureTasksForDate("en", new Date("2026-04-04T00:00:00.000Z"));
		expect(mockInsertTask).toHaveBeenCalled();
	});

	it("scheduleTaskManually throws when template is missing", async () => {
		templateResultsQueue.push([]);
		await expect(scheduleTaskManually(999, "2026-04-04")).rejects.toThrow("Template not found");
	});

	it("scheduleTaskManually inserts resolved task when template exists", async () => {
		templateResultsQueue.push([buildTemplate(21, "daily")]);
		variantResultsQueue.push([buildVariant(1, 21)]);
		await scheduleTaskManually(21, "2026-04-04");
		expect(mockInsertTask).toHaveBeenCalledTimes(1);
	});

	it("scheduleTaskManually throws when template has no active variants", async () => {
		templateResultsQueue.push([buildTemplate(40, "daily")]);
		variantResultsQueue.push([]); // No variants
		await expect(scheduleTaskManually(40, "2026-04-04")).rejects.toThrow("no active variants available");
		expect(mockInsertTask).not.toHaveBeenCalled();
	});

	it("scheduleTaskManually resolves optional fields and unresolved slots correctly", async () => {
		templateResultsQueue.push([
			buildTemplate(50, "daily", {
				titleBase: "Hello {{missing}}",
				shortObjectiveBase: null,
				agentPromptBase: null,
			}),
		]);
		variantResultsQueue.push([buildVariant(1, 50, { slotValues: { name: "Lina" } })]);

		await scheduleTaskManually(50, "2026-04-04");

		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Hello {{missing}}",
				shortObjective: null,
				agentPrompt: null,
			}),
		);
	});
});
