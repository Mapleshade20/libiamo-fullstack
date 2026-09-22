import { describe, expect, it } from "vitest";
import { applyQuestCompletion, applyReviewObservation, emptyStreakRecord, type StreakRecord, viewStreak } from "$lib/streak";
import { advancePresentationReceipt, completionChange, flameAppearance, parsePresentationReceipt, streakWeek } from "$lib/streak-presentation";

const day = "2026-09-18";
const seed: StreakRecord = { ...emptyStreakRecord(), streakDays: 12, throughDate: "2026-09-17", bank: 1 };
const before = viewStreak(seed, day);
const baseline = { day, progress: 0, pending: null } as const;

describe("completion presentation, independent of art", () => {
	it.each(["quest", "review"])("shows one blue spark then ignition with %s first", (first) => {
		const half = first === "quest" ? applyQuestCompletion(seed, day, false) : applyReviewObservation(seed, day, true);
		const halfView = viewStreak(half, day);
		expect(flameAppearance(before)).toBe("gray");
		expect(flameAppearance(halfView)).toBe("kindling");
		const receipt = advancePresentationReceipt(baseline, halfView, day);
		expect(receipt).toEqual({ day, progress: 1, pending: "kindling" });
		const whole = first === "quest" ? applyReviewObservation(half, day, true) : applyQuestCompletion(half, day, true);
		const view = viewStreak(whole, day);
		expect(flameAppearance(view)).toBe("burn");
		expect(view.days).toBe(13);
		expect(advancePresentationReceipt(receipt, view, day)).toEqual({ day, progress: 2, pending: "ignite" });
	});
	it("goes straight to ignition when a quest observes an already empty queue", () => {
		const view = viewStreak(applyQuestCompletion(seed, day, true), day);
		expect(completionChange(baseline, view, day)).toBe("ignite");
	});
	it("establishes a silent baseline for first visit and for a new day", () => {
		const view = viewStreak(applyQuestCompletion(seed, day, true), day);
		expect(advancePresentationReceipt(null, view, day).pending).toBeNull();
		expect(advancePresentationReceipt({ day: "2026-09-17", progress: 1, pending: "kindling" }, view, day).pending).toBeNull();
	});
	it("persists pending work across a hard reload without consuming it at an intermediate stage", () => {
		const half = viewStreak(applyQuestCompletion(seed, day, false), day);
		const pending = advancePresentationReceipt(baseline, half, day);
		const restored = parsePresentationReceipt(JSON.stringify(pending));
		expect(advancePresentationReceipt(restored, half, day).pending).toBe("kindling");
		const consumed = { ...pending, pending: null };
		expect(advancePresentationReceipt(parsePresentationReceipt(JSON.stringify(consumed)), half, day).pending).toBeNull();
	});
	it("does not replay after stale data or more quests, but still earns a saved day", () => {
		let record = applyQuestCompletion(seed, day, true);
		const acknowledged = { day, progress: 2, pending: null } as const;
		const stale = advancePresentationReceipt(acknowledged, before, day);
		expect(stale.progress).toBe(2);
		for (let i = 0; i < 2; i++) record = applyQuestCompletion(record, day, true);
		const view = viewStreak(record, day);
		expect(view.bank).toBe(2);
		expect(advancePresentationReceipt(stale, view, day).pending).toBeNull();
	});
	it("discards malformed receipts and invalid pending kinds", () => {
		for (const raw of [null, "broken", "null", "{}", '{"day":"today","progress":1}', '{"day":"2026-09-18","progress":9}']) {
			expect(parsePresentationReceipt(raw)).toBeNull();
		}
		expect(parsePresentationReceipt(JSON.stringify({ ...baseline, pending: "other" }))?.pending).toBeNull();
	});
});

describe("history-backed reward week", () => {
	it("retains recorded outcomes after a break and does not infer missing history", () => {
		const week = streakWeek(viewStreak(null, day), day, [
			{ day: "2026-09-15", state: "lit" },
			{ day: "2026-09-16", state: "covered" },
		]);
		expect(week.map((d) => d.day)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", day, "2026-09-19", "2026-09-20"]);
		expect(week.filter((d) => d.continued).map((d) => d.state)).toEqual(["lit", "covered"]);
		expect(streakWeek(before, day).every((d) => !d.continued)).toBe(true);
	});
	it("shows today's authoritative completion before the history request resolves, never the future", () => {
		const view = viewStreak(applyQuestCompletion(null, day, true), day);
		const week = streakWeek(view, day, [{ day: "2026-09-19", state: "lit" }]);
		expect(week.filter((d) => d.continued).map((d) => d.day)).toEqual([day]);
	});
	it("handles a Sunday across a month boundary", () => {
		const week = streakWeek(viewStreak(null, "2026-03-01"), "2026-03-01");
		expect(week[0].day).toBe("2026-02-23");
		expect(week[6].today).toBe(true);
	});
});
