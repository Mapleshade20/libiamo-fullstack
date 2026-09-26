import { describe, expect, it } from "vitest";
import { calendarDays, coveredDays, historyChanges, monthOffset, monthRange, validMonth } from "$lib/streak/history";
import { applyQuestCompletion, applyReviewObservation, emptyStreakRecord } from "$lib/streak/rules";

const seed = { ...emptyStreakRecord(), streakDays: 12, throughDate: "2026-09-15", bank: 2 };
describe("sparse streak calendar", () => {
	it("uses a stable six-week Monday-first window across leap days and years", () => {
		expect(monthRange("2024-02")).toEqual({ from: "2024-01-29", to: "2024-03-10" });
		expect(monthRange("2026-02")).toEqual({ from: "2026-01-26", to: "2026-03-08" });
		expect(monthOffset("2026-01", -1)).toBe("2025-12");
		expect(monthOffset("2026-12", 1)).toBe("2027-01");
	});
	it("rejects malformed or unbounded month requests", () => {
		for (const month of ["", "2026-2", "2026-13", "2026-00", "2026-02-01", "0000-01", "9999-12", "2026-02;drop"])
			expect(validMonth(month)).toBe(false);
		expect(validMonth("2024-02")).toBe(true);
	});
	it.each(["quest", "review"])("records only the completed day with %s first", (first) => {
		const before = emptyStreakRecord();
		const half = first === "quest" ? applyQuestCompletion(before, "2026-09-18", false) : applyReviewObservation(before, "2026-09-18", true);
		expect(historyChanges(before, half, "2026-09-18")).toEqual([]);
		const full = first === "quest" ? applyReviewObservation(half, "2026-09-18", true) : applyQuestCompletion(half, "2026-09-18", true);
		expect(historyChanges(half, full, "2026-09-18")).toEqual([{ day: "2026-09-18", state: "lit" }]);
	});
	it("projects and materializes exactly the same protected days", () => {
		const projected = coveredDays(seed, "2026-09-18");
		expect(projected).toEqual([
			{ day: "2026-09-16", state: "covered" },
			{ day: "2026-09-17", state: "covered" },
		]);
		const after = applyQuestCompletion(seed, "2026-09-18", true);
		expect(historyChanges(seed, after, "2026-09-18")).toEqual([...projected, { day: "2026-09-18", state: "lit" }]);
		expect(coveredDays(after, "2026-09-18")).toEqual([]);
	});
	it("does not turn an insufficient bank into fictitious protected dates", () => {
		expect(coveredDays(seed, "2026-09-19")).toEqual([]);
	});
	it("keeps earlier runs after a break; never expands an aggregate into history", () => {
		const stored = [{ day: "2026-09-02", state: "lit" as const }];
		expect(calendarDays(stored, seed, "2026-09-25", "2026-09-01", "2026-09-30")).toEqual(stored);
		expect(calendarDays([], seed, "2026-09-16", "2026-09-01", "2026-09-30")).toEqual([]);
	});
	it("filters out other months and future dates, without overwriting known outcomes", () => {
		const stored = [
			{ day: "2026-08-01", state: "lit" as const },
			{ day: "2026-09-16", state: "lit" as const },
			{ day: "2026-09-25", state: "lit" as const },
		];
		expect(calendarDays(stored, seed, "2026-09-18", "2026-09-01", "2026-09-30")).toEqual([
			{ day: "2026-09-16", state: "lit" },
			{ day: "2026-09-17", state: "covered" },
		]);
	});
	it("respects monotonic local-day clamping on a timezone rollback", () => {
		const before = applyQuestCompletion(null, "2026-09-18", true);
		const after = applyQuestCompletion(before, "2026-09-17", true);
		expect(historyChanges(before, after, "2026-09-17")).toEqual([{ day: "2026-09-18", state: "lit" }]);
	});
});
