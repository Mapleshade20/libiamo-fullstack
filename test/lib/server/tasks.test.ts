import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockInsertTaskConflict,
	mockInsertTaskValues,
	mockInsertTask,
	mockUpdateSet,
	mockUpdate,
	mockSelect,
	countResultsQueue,
	templateResultsQueue,
} = vi.hoisted(() => {
	const countResultsQueue: Array<Array<{ count: number }>> = [];
	const templateResultsQueue: Array<any[]> = [];

	const mockInsertTaskConflict = vi.fn(async () => undefined);
	const mockInsertTaskValues = vi.fn(() => ({ onConflictDoNothing: mockInsertTaskConflict }));
	const mockInsertTask = vi.fn(() => ({ values: mockInsertTaskValues }));

	const mockUpdateWhere = vi.fn(async () => undefined);
	const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
	const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

	const readCountResult = async () => countResultsQueue.shift() ?? [{ count: 0 }];
	const readTemplateResult = async () => templateResultsQueue.shift() ?? [];

	const createTemplateWhereResult = () => ({
		orderBy: () => ({
			limit: readTemplateResult,
		}),
		limit: readTemplateResult,
	});

	const createTemplateFromResult = () => ({
		where: createTemplateWhereResult,
	});

	const createCountFromResult = () => ({
		where: readCountResult,
	});

	const mockSelect = vi.fn((selection?: unknown) => {
		if (selection && typeof selection === "object" && "count" in selection) {
			return {
				from: createCountFromResult,
			};
		}

		return {
			from: createTemplateFromResult,
		};
	});

	return {
		mockInsertTaskConflict,
		mockInsertTaskValues,
		mockInsertTask,
		mockUpdateSet,
		mockUpdate,
		mockSelect,
		countResultsQueue,
		templateResultsQueue,
	};
});

vi.mock("$lib/server/db", () => ({
	db: {
		select: mockSelect,
		insert: mockInsertTask,
		update: mockUpdate,
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	task: {
		date: "date",
		templateId: "templateId",
		id: "id",
		language: "language",
	},
	template: {
		id: "id",
		language: "language",
		duration: "duration",
		isActive: "isActive",
		lastScheduledAt: "lastScheduledAt",
		$inferSelect: {},
	},
}));

import { ensureTasksForDate, getMondayOfWeek, scheduleTaskManually, toDateString } from "../../../src/lib/server/tasks";

function buildTemplate(id: number, duration: "weekly" | "daily", overrides: Record<string, unknown> = {}) {
	return {
		id,
		language: "en",
		duration,
		isActive: true,
		titleBase: "Hello {{name}}",
		shortObjectiveBase: "Short {{topic}}",
		descriptionBase: "Desc {{topic}}",
		objectivesBase: [{ order: 1, text: "Talk about {{topic}}" }],
		agentPromptBase: "Prompt {{topic}}",
		candidates: [{ slots: { name: "Lina", topic: "music" }, context: { mood: "happy" } }],
		...overrides,
	};
}

describe("tasks helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		countResultsQueue.length = 0;
		templateResultsQueue.length = 0;
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
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("ensureTasksForDate schedules missing weekly and daily tasks", async () => {
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
		countResultsQueue.push([{ count: 1 }], [{ count: 2 }]);
		templateResultsQueue.push([buildTemplate(1, "weekly"), buildTemplate(2, "weekly")], [buildTemplate(3, "daily")]);

		await ensureTasksForDate("en", new Date("2026-04-04T00:00:00.000Z"));

		expect(mockInsertTask).toHaveBeenCalledTimes(3);
		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				templateId: 1,
				origin: "auto",
				titleResolved: "Hello Lina",
				descriptionResolved: "Desc music",
				agentPromptResolved: "Prompt music",
			}),
		);
		expect(mockInsertTaskConflict).toHaveBeenCalledWith({ target: ["date", "templateId"] });
		expect(mockUpdateSet).toHaveBeenCalled();
		randomSpy.mockRestore();
	});

	it("ensureTasksForDate catches scheduling errors and continues", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		countResultsQueue.push([{ count: 2 }], [{ count: 3 }]);
		templateResultsQueue.push([buildTemplate(11, "weekly")]);
		mockInsertTaskConflict.mockRejectedValueOnce(new Error("insert failed"));

		await ensureTasksForDate("en", new Date("2026-04-04T00:00:00.000Z"));

		expect(errorSpy).toHaveBeenCalled();
	});

	it("ensureTasksForDate catches daily scheduling errors", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		countResultsQueue.push([{ count: 3 }], [{ count: 2 }]);
		templateResultsQueue.push([buildTemplate(12, "daily")]);
		mockInsertTaskConflict.mockRejectedValueOnce(new Error("daily insert failed"));

		await ensureTasksForDate("en", new Date("2026-04-04T00:00:00.000Z"));

		expect(errorSpy).toHaveBeenCalled();
	});

	it("ensureTasksForDate handles missing count rows with defaults", async () => {
		countResultsQueue.push([], []);
		templateResultsQueue.push([buildTemplate(30, "weekly")], [buildTemplate(31, "daily")]);

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

		await scheduleTaskManually(21, "2026-04-04");

		expect(mockInsertTask).toHaveBeenCalledTimes(1);
		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				templateId: 21,
				origin: "manual",
				titleResolved: "Hello Lina",
				shortObjectiveResolved: "Short music",
			}),
		);
		randomSpy.mockRestore();
	});

	it("scheduleTaskManually returns early when template has no candidates", async () => {
		templateResultsQueue.push([buildTemplate(40, "daily", { candidates: [] })]);

		await scheduleTaskManually(40, "2026-04-04");

		expect(mockInsertTask).not.toHaveBeenCalled();
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("scheduleTaskManually resolves optional fields and unresolved slots correctly", async () => {
		templateResultsQueue.push([
			buildTemplate(50, "daily", {
				titleBase: "Hello {{missing}}",
				shortObjectiveBase: null,
				descriptionBase: null,
				agentPromptBase: null,
				objectivesBase: null,
				candidates: [{ slots: { name: "Lina" } }],
			}),
		]);

		await scheduleTaskManually(50, "2026-04-04");

		expect(mockInsertTaskValues).toHaveBeenCalledWith(
			expect.objectContaining({
				titleResolved: "Hello {{missing}}",
				shortObjectiveResolved: null,
				descriptionResolved: null,
				agentPromptResolved: null,
				objectivesResolved: null,
				contextResolved: null,
			}),
		);
	});
});
