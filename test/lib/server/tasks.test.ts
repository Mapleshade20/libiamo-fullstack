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

				// Task count/scheduled query: has variantId (unique to task table)
				if (table && "variantId" in table) {
					// Return a chainable object that supports BOTH innerJoin() and where() directly,
					// to cover both count queries (which use innerJoin) and scheduled queries (which just use where).
					const taskChain = {
						innerJoin: () => taskChain,
						where: readCountResult,
					};
					return taskChain;
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
		cadence: "cadence",
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

import {
	ensureTasksForDate,
	getMondayFromWeekString,
	getMondayOfWeekForDate,
	scheduleTaskManually,
	toDateString,
} from "$lib/server/scheduling/tasks";

// ── 2. Helpers ─────────────────────────────────────────────────────────
function buildTemplate(id: number, cadence: Cadence, overrides: Record<string, unknown> = {}) {
	return {
		id,
		language: "en",
		cadence,
		urgency: "high",
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

		// Explicitly reset the mocked implementation and history to prevent test pollution
		// in case a previous test threw an error before consuming its mockRejectedValueOnce.
		mockInsertTaskConflict.mockReset();
		mockInsertTaskConflict.mockImplementation(async () => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- Date Utility Tests ---
	describe("getMondayFromWeekString", () => {
		it("calculates correct Monday for mid-year week", () => {
			const result = getMondayFromWeekString("2024-W20");
			expect(toDateString(result)).toBe("2024-05-13");
		});

		it("calculates correct Monday when week 1 rolls into previous year", () => {
			const result = getMondayFromWeekString("2026-W01");
			expect(toDateString(result)).toBe("2025-12-29");
		});
	});

	it("toDateString returns YYYY-MM-DD", () => {
		expect(toDateString(new Date("2026-04-04T08:30:00.000Z"))).toBe("2026-04-04");
	});

	// --- getMondayOfWeekForDate (timezone-independent UTC) ---
	describe("getMondayOfWeekForDate", () => {
		it("returns the same Monday when date is already Monday", () => {
			expect(getMondayOfWeekForDate("2026-04-13")).toBe("2026-04-13");
		});

		it("returns previous Monday for a Sunday", () => {
			expect(getMondayOfWeekForDate("2026-04-19")).toBe("2026-04-13");
		});

		it("is timezone-independent: result is identical regardless of process TZ", () => {
			// Sunday that would shift if interpreted in e.g. Pacific/Auckland (UTC+12)
			const results = new Set<string>();
			const tzValues = ["UTC", "America/New_York", "Asia/Tokyo", "Pacific/Auckland"];
			for (const tz of tzValues) {
				process.env.TZ = tz;
				results.add(getMondayOfWeekForDate("2026-04-19"));
			}
			delete process.env.TZ;
			expect(results.size).toBe(1);
			expect([...results][0]).toBe("2026-04-13");
		});

		it("handles week spanning year boundary (Sunday Jan 4 2026)", () => {
			// 2026-01-04 is a Sunday; its ISO week Monday is 2025-12-29
			expect(getMondayOfWeekForDate("2026-01-04")).toBe("2025-12-29");
		});
	});

	// --- ensureTasksForDate Tests ---
	it("ensureTasksForDate does nothing when quotas are already met", async () => {
		countResultsQueue.push([{ count: 3 }], [{ count: 3 }]);
		await ensureTasksForDate("en", "2026-04-04");
		expect(mockInsertTask).not.toHaveBeenCalled();
	});

	it("ensureTasksForDate schedules missing weekly and daily tasks", async () => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
		countResultsQueue.push([{ count: 1 }], [{ count: 2 }]);
		templateResultsQueue.push([{ tpl: buildTemplate(1, "weekly") }, { tpl: buildTemplate(2, "weekly") }], [{ tpl: buildTemplate(3, "daily") }]);
		variantResultsQueue.push([buildVariant(1, 1)], [buildVariant(2, 2)], [buildVariant(3, 3)]);

		await ensureTasksForDate("en", "2026-04-04");

		expect(mockInsertTask).toHaveBeenCalledTimes(3);
		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				templateId: 1,
				variantId: 1,
				origin: "auto",
				urgency: "high",
				maxSessionAgeSeconds: 43_200,
			}),
		);
		randomSpy.mockRestore();
	});

	it("ensureTasksForDate excludes already scheduled templates (covers notInArray branch)", async () => {
		countResultsQueue.push([{ count: 1 }], [{ count: 3 }], [{ templateId: 99 }]);
		templateResultsQueue.push([{ tpl: buildTemplate(42, "weekly") }]);
		variantResultsQueue.push([buildVariant(1, 42)]);

		await ensureTasksForDate("en", "2026-04-04");
		expect(mockInsertTask).toHaveBeenCalled();
	});

	it("ensureTasksForDate catches scheduling errors and continues", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		countResultsQueue.push([{ count: 2 }], [{ count: 3 }]);
		templateResultsQueue.push([{ tpl: buildTemplate(11, "weekly") }]);
		variantResultsQueue.push([buildVariant(1, 11)]);

		// Queue a failure for the insert statement
		mockInsertTaskConflict.mockRejectedValueOnce(new Error("insert failed"));

		await ensureTasksForDate("en", "2026-04-04");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to schedule weekly task"), expect.any(Error));
	});

	it("ensureTasksForDate handles missing count rows with defaults", async () => {
		countResultsQueue.push([], []);
		templateResultsQueue.push([{ tpl: buildTemplate(30, "weekly") }], [{ tpl: buildTemplate(31, "daily") }]);
		variantResultsQueue.push([buildVariant(1, 30)], [buildVariant(2, 31)]);

		await ensureTasksForDate("en", "2026-04-04");
		expect(mockInsertTask).toHaveBeenCalled();
	});

	// --- EDGE CASE & VULNERABILITY TESTS ---

	// Edge Case: Defensive check to ensure we don't accidentally try to schedule negative tasks if data is anomalous
	it("ensureTasksForDate handles excessively high database counts without scheduling negatives", async () => {
		countResultsQueue.push([{ count: 999 }], [{ count: 50 }]); // Anomaly: More tasks than max quota
		await ensureTasksForDate("en", "2026-04-04");
		// Math.max(0, 3 - count) should prevent it from passing negative neededCount to scheduleAutoTasks
		expect(mockInsertTask).not.toHaveBeenCalled();
	});

	// Security/Validation Edge Case: Ensure the regex replacer handles prototype injection safely without crashing
	it("scheduleTaskManually resolves templates safely ignoring prototype pollution attempts", async () => {
		templateResultsQueue.push([buildTemplate(100, "daily", { titleBase: "User {{__proto__}} says hi" })]);
		variantResultsQueue.push([buildVariant(1, 100, { slotValues: { normal: "val" } })]);

		await scheduleTaskManually(100, "2026-04-04");

		// It shouldn't crash, and should just gracefully leave the unresolved slot as is
		expect(mockInsertTaskValues).toHaveBeenCalledWith(expect.objectContaining({ title: "User {{__proto__}} says hi" }));
	});

	// Edge Case: Gracefully handling completely mangled date strings with daily cadence
	it("scheduleTaskManually rejects completely invalid date strings for daily templates", async () => {
		templateResultsQueue.push([buildTemplate(99, "daily")]);

		await expect(scheduleTaskManually(99, "not-a-date")).rejects.toThrow("Invalid date string");
		expect(mockInsertTask).not.toHaveBeenCalled();
	});

	// Regression: valid-format but impossible dates (e.g. Feb 30) must be rejected
	it("scheduleTaskManually rejects valid-format but impossible calendar dates for daily templates", async () => {
		templateResultsQueue.push([buildTemplate(99, "daily")]);

		await expect(scheduleTaskManually(99, "2026-02-30")).rejects.toThrow("Invalid date string");
		expect(mockInsertTask).not.toHaveBeenCalled();
	});

	// Strict weekly scheduling: non-week-string dates must be rejected
	it("scheduleTaskManually rejects a calendar date for weekly templates", async () => {
		templateResultsQueue.push([buildTemplate(99, "weekly")]);
		await expect(scheduleTaskManually(99, "2026-04-04")).rejects.toThrow("Weekly templates require an ISO week date string (e.g. 2026-W16)");
		expect(mockInsertTask).not.toHaveBeenCalled();
	});

	it("scheduleTaskManually accepts a valid ISO week string for weekly templates", async () => {
		templateResultsQueue.push([buildTemplate(98, "weekly")]);
		variantResultsQueue.push([buildVariant(2, 98)]);
		await scheduleTaskManually(98, "2026-W16");
		expect(mockInsertTask).toHaveBeenCalledTimes(1);
		expect(mockInsertTaskValues).toHaveBeenCalledWith(expect.objectContaining({ origin: "manual" }));
	});

	// --- scheduleTaskManually Tests ---
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
				shortObjectiveBase: "Focus on {{topic}}",
				descriptionBase: null,
				agentPromptBase: null,
			}),
		]);
		variantResultsQueue.push([buildVariant(1, 50, { slotValues: { name: "Lina", topic: "music" } })]);

		await scheduleTaskManually(50, "2026-04-04");

		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Hello {{missing}}",
				shortObjective: "Focus on music",
				description: null,
				agentPrompt: null,
			}),
		);
	});
});
