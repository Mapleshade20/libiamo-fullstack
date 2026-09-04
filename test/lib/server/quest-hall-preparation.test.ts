import { beforeEach, describe, expect, it, vi } from "vitest";
import { getQuestHallPreparation, QuestHallPreparationRequestError } from "$lib/server/quest-hall-preparation";

const { mockSelect, mockLimit, mockGetTaskPreparationData, mockGetTranslationPreparationData } = vi.hoisted(() => {
	const mockLimit = vi.fn();
	const chain: Record<string, unknown> = {};
	chain.from = vi.fn(() => chain);
	chain.innerJoin = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	chain.limit = mockLimit;
	return {
		mockSelect: vi.fn(() => chain),
		mockLimit,
		mockGetTaskPreparationData: vi.fn(),
		mockGetTranslationPreparationData: vi.fn(),
	};
});

vi.mock("drizzle-orm", () => ({
	and: (...conditions: unknown[]) => ({ op: "and", conditions }),
	eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
}));

vi.mock("$lib/server/db", () => ({ db: { select: mockSelect } }));

vi.mock("$lib/server/db/schema", () => ({
	task: { id: "task.id", templateId: "task.templateId", language: "task.language", date: "task.date", cadence: "task.cadence" },
	template: { id: "template.id", language: "template.language", ui: "template.ui", isActive: "template.isActive", createdAt: "template.createdAt" },
}));

vi.mock("$lib/server/scheduling/dates", () => ({
	getLocalDateString: (_timezone: string, date?: Date) => (date ? date.toISOString().slice(0, 10) : "2026-09-04"),
	getMondayOfWeekForDate: () => "2026-08-31",
}));

vi.mock("$lib/server/task-preparation", () => ({ getTaskPreparationData: mockGetTaskPreparationData }));
vi.mock("$lib/server/translation-preparation", () => ({ getTranslationPreparationData: mockGetTranslationPreparationData }));

const user = { id: "u1", activeLanguage: "en", nativeLanguage: "fr" };

describe("getQuestHallPreparation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects malformed selections and stale editions before querying", async () => {
		await expect(
			getQuestHallPreparation({ user, key: "daily-nope", editionDate: "2026-09-04", browserTimezone: "Europe/Paris" }),
		).rejects.toBeInstanceOf(QuestHallPreparationRequestError);
		await expect(getQuestHallPreparation({ user, key: "daily-1", editionDate: "2026-09-03", browserTimezone: "Europe/Paris" })).rejects.toMatchObject(
			{ status: 409 },
		);
		expect(mockSelect).not.toHaveBeenCalled();
	});

	it("loads a current scheduled quest through the existing preparation service", async () => {
		const data = { task: { id: 7, title: "Quest" }, nativeLanguage: "fr" };
		mockLimit.mockResolvedValueOnce([{ id: 7 }]);
		mockGetTaskPreparationData.mockResolvedValueOnce(data);

		await expect(getQuestHallPreparation({ user, key: "weekly-7", editionDate: "2026-09-04", browserTimezone: "Europe/Paris" })).resolves.toEqual({
			kind: "quest",
			key: "weekly-7",
			data,
		});
		expect(mockGetTaskPreparationData).toHaveBeenCalledWith({ userId: "u1", taskId: 7 });
	});

	it("returns null when the selected item is outside the current catalog", async () => {
		mockLimit.mockResolvedValueOnce([]);
		await expect(getQuestHallPreparation({ user, key: "daily-99", editionDate: "2026-09-04", browserTimezone: "Europe/Paris" })).resolves.toBeNull();
		expect(mockGetTaskPreparationData).not.toHaveBeenCalled();
	});

	it("loads only current-month translation entries", async () => {
		const data = { template: { id: 12 }, attempt: null, blockedReason: null };
		mockLimit.mockResolvedValueOnce([{ createdAt: new Date("2026-09-02T12:00:00.000Z") }]);
		mockGetTranslationPreparationData.mockResolvedValueOnce(data);

		await expect(
			getQuestHallPreparation({ user, key: "translation-12", editionDate: "2026-09-04", browserTimezone: "Europe/Paris" }),
		).resolves.toEqual({ kind: "translation", key: "translation-12", data });
		expect(mockGetTranslationPreparationData).toHaveBeenCalledWith({
			userId: "u1",
			templateId: 12,
			activeLanguage: "en",
			nativeLanguage: "fr",
		});
	});
});
