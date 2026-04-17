import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cadence } from "$lib/constants";

const { mockInsertTaskConflict, mockInsertTaskValues, mockInsertTask, mockSelect, countResultsQueue, templateResultsQueue, variantResultsQueue } =
	vi.hoisted(() => {
		const countResultsQueue: Array<Array<{ count: number }>> = [];
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
					return {
						where: readVariantResult,
					};
				}
				// Task count query: has date but not cadence
				if (table && "date" in table && !("cadence" in table)) {
					return {
						where: readCountResult,
					};
				}
				// Template query: has cadence
				return {
					// ensureTasksForDate: select → from → leftJoin → where → groupBy → orderBy → limit
					leftJoin: () => ({
						where: () => ({
							groupBy: () => ({
								orderBy: () => ({
									limit: readTemplateResult,
								}),
							}),
						}),
					}),
					// scheduleTaskManually: select → from → where → limit
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

import { ensureTasksForDate, getMondayOfWeek, scheduleTaskManually, toDateString } from "../../../src/lib/server/tasks";

function buildTemplate(id: number, cadence: Cadence, overrides: Record<string, unknown> = {}) {
	return {
		id,
		language: "en",
		cadence,
		isActive: true,
		titleBase: "Hello {{name}}",
		shortObjectiveBase: null,
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

	it("getMondayOfWeek returns monday for a sunday date", () => {
		const monday = getMondayOfWeek(new Date("2026-04-05T12:00:00.000Z"));
		expect(monday.getDay()).toBe(1);
		expect(monday.getHours()).toBe(0);
		expect(monday.getMinutes()).toBe(0);
		expect(monday.getSeconds()).toBe(0);
		expect(monday.getMilliseconds()).toBe(0);
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
				title: "Hello Lina",
				description: "Desc music",
				agentPrompt: expect.any(String),
			}),
		);
		expect(mockInsertTaskConflict).toHaveBeenCalledWith({ target: ["date", "templateId"] });
		randomSpy.mockRestore();
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

	it("ensureTasksForDate catches daily scheduling errors", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		countResultsQueue.push([{ count: 3 }], [{ count: 2 }]);
		templateResultsQueue.push([{ tpl: buildTemplate(12, "daily") }]);
		variantResultsQueue.push([buildVariant(1, 12)]);
		mockInsertTaskConflict.mockRejectedValueOnce(new Error("daily insert failed"));

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
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
		templateResultsQueue.push([buildTemplate(21, "daily")]);
		variantResultsQueue.push([buildVariant(1, 21)]);

		await scheduleTaskManually(21, "2026-04-04");

		expect(mockInsertTask).toHaveBeenCalledTimes(1);
		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				templateId: 21,
				variantId: 1,
				origin: "manual",
				title: "Hello Lina",
			}),
		);
		randomSpy.mockRestore();
	});

	it("scheduleTaskManually returns early when template has no active variants", async () => {
		templateResultsQueue.push([buildTemplate(40, "daily")]);
		variantResultsQueue.push([]); // No active variants

		await scheduleTaskManually(40, "2026-04-04");

		expect(mockInsertTask).not.toHaveBeenCalled();
	});

	it("scheduleTaskManually resolves optional fields and unresolved slots correctly", async () => {
		templateResultsQueue.push([
			buildTemplate(50, "daily", {
				titleBase: "Hello {{missing}}",
				shortObjectiveBase: null,
				descriptionBase: null,
				agentPromptBase: null,
				objectivesBase: null,
			}),
		]);
		variantResultsQueue.push([buildVariant(1, 50, { slotValues: { name: "Lina" } })]);

		await scheduleTaskManually(50, "2026-04-04");

		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Hello {{missing}}",
				description: null,
				agentPrompt: null,
				objectives: null,
			}),
		);
	});
});
