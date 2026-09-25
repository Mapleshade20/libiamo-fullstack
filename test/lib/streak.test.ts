import { describe, expect, it } from "vitest";
import { localDay, startOfNextLocalDay } from "$lib/local-day";
import {
	applyQuestCompletion,
	applyReviewObservation,
	effectiveToday,
	emptyStreakRecord,
	type StreakRecord,
	savedDaysFor,
	settle,
	viewStreak,
} from "$lib/streak";

const DAY = "2026-09-18";
const YESTERDAY = "2026-09-17";

function record(overrides: Partial<StreakRecord> = {}): StreakRecord {
	return { ...emptyStreakRecord(), ...overrides };
}

/** A quest completed with the review queue already empty — the two-part rule fully satisfied. */
function litQuest(current: StreakRecord | null, day = DAY) {
	return applyQuestCompletion(current, day, true);
}

describe("local days", () => {
	it("reads the learner's calendar day and the instant their next one begins", () => {
		const at = new Date("2026-09-18T03:30:00.000Z");
		expect(localDay(at, "UTC")).toBe("2026-09-18");
		// 03:30 UTC is still the 17th in New York, so the next local day starts at 04:00 UTC.
		expect(localDay(at, "America/New_York")).toBe("2026-09-17");
		expect(startOfNextLocalDay(at, "America/New_York").toISOString()).toBe("2026-09-18T04:00:00.000Z");
		expect(startOfNextLocalDay(at, "Asia/Tokyo").toISOString()).toBe("2026-09-18T15:00:00.000Z");
	});

	it("survives a DST transition without shortening or lengthening a day", () => {
		// The US spring-forward night: local midnight still exists, and the day that follows starts
		// one hour earlier in UTC than the one before it.
		const before = new Date("2026-03-07T18:00:00.000Z");
		expect(startOfNextLocalDay(before, "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
		const after = new Date("2026-03-08T18:00:00.000Z");
		expect(startOfNextLocalDay(after, "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
	});
});

describe("saved-day thresholds", () => {
	it("earns at the triangular numbers and never exceeds the cap", () => {
		expect([0, 1, 2].map(savedDaysFor)).toEqual([0, 0, 0]);
		expect([3, 4, 5].map(savedDaysFor)).toEqual([1, 1, 1]);
		expect([6, 9].map(savedDaysFor)).toEqual([2, 2]);
		// The cap is what keeps the column's check constraint satisfiable at any quest count.
		expect([10, 15, 100].map(savedDaysFor)).toEqual([3, 3, 3]);
	});
});

describe("lighting a day", () => {
	it("needs a quest and a cleared queue, in either order", () => {
		const questFirst = applyQuestCompletion(null, DAY, false);
		expect(questFirst).toMatchObject({ streakDays: 0, throughDate: null, taskCount: 1, reviewCleared: false });
		expect(applyReviewObservation(questFirst, DAY, true)).toMatchObject({ streakDays: 1, throughDate: DAY });

		const reviewFirst = applyReviewObservation(null, DAY, true);
		expect(reviewFirst).toMatchObject({ streakDays: 0, throughDate: null, reviewCleared: true });
		expect(applyQuestCompletion(reviewFirst, DAY, false)).toMatchObject({ streakDays: 1, throughDate: DAY });
	});

	it("never retracts a cleared queue when later cards fall due", () => {
		const lit = litQuest(null);
		expect(lit).toMatchObject({ streakDays: 1, throughDate: DAY, reviewCleared: true });
		expect(applyReviewObservation(lit, DAY, false)).toMatchObject({ streakDays: 1, throughDate: DAY, reviewCleared: true });
	});

	it("counts a day once however many quests it holds", () => {
		let current = litQuest(null);
		current = litQuest(current);
		current = litQuest(current);
		expect(current).toMatchObject({ streakDays: 1, throughDate: DAY, taskCount: 3 });
	});

	it("writes nothing worth storing when an observation finds cards due on an untouched account", () => {
		expect(applyReviewObservation(null, DAY, false)).toEqual(emptyStreakRecord());
	});
});

describe("earning saved days", () => {
	it("grants exactly once per threshold however often quests repeat", () => {
		let current: StreakRecord | null = null;
		for (let index = 0; index < 10; index++) current = applyQuestCompletion(current, DAY, true);
		expect(current).toMatchObject({ taskCount: 10, bank: 3, bankEarnedToday: 3, streakDays: 1 });
	});

	it("ignores the review gate: three quests earn a saved day on a day that stays dark", () => {
		let current: StreakRecord | null = null;
		for (let index = 0; index < 3; index++) current = applyQuestCompletion(current, DAY, false);
		expect(current).toMatchObject({ streakDays: 0, throughDate: null, bank: 1, bankEarnedToday: 1 });
	});

	it("lets a saved day earned on a dark day cover that very day", () => {
		let current: StreakRecord | null = record({ streakDays: 5, throughDate: YESTERDAY });
		for (let index = 0; index < 3; index++) current = applyQuestCompletion(current, DAY, false);
		expect(current).toMatchObject({ streakDays: 5, throughDate: YESTERDAY, bank: 1 });

		// The day elapses dark. Coming back, the badge pays for it and the number still grows.
		const next = viewStreak(current, "2026-09-19");
		expect(next).toMatchObject({ days: 6, bank: 0, savedDaysSpent: 1, status: "pending" });
	});
});

describe("settlement", () => {
	it("leaves a live streak alone and shows pending before today is lit", () => {
		const current = record({ streakDays: 4, throughDate: YESTERDAY, bank: 2 });
		expect(settle(current, DAY)).toEqual({ days: 4, bank: 2, spent: 0, broken: false });
		expect(viewStreak(current, DAY)).toMatchObject({ days: 4, bank: 2, status: "pending", savedDaysSpent: 0 });
	});

	it("spends one saved day per missed day and adds each to the number", () => {
		const current = record({ streakDays: 12, throughDate: "2026-09-15", bank: 2 });
		expect(settle(current, DAY)).toEqual({ days: 14, bank: 0, spent: 2, broken: false });
		expect(viewStreak(current, DAY)).toMatchObject({ days: 14, bank: 0, savedDaysSpent: 2, status: "pending" });
	});

	it("ends the streak when the badge cannot cover every missed day", () => {
		const current = record({ streakDays: 12, throughDate: "2026-09-14", bank: 2 });
		expect(settle(current, DAY)).toEqual({ days: 0, bank: 0, spent: 0, broken: true });
		expect(viewStreak(current, DAY)).toMatchObject({ days: 0, bank: 0, status: "none" });
	});

	it("never spends saved days earned today, and keeps them through a break", () => {
		const current = record({ streakDays: 6, throughDate: "2026-09-15", bank: 1, progressDate: DAY, taskCount: 3, bankEarnedToday: 1 });
		// Two days elapsed dark; the only saved day belongs to today and cannot pay for them.
		expect(settle(current, DAY)).toEqual({ days: 0, bank: 1, spent: 0, broken: true });
	});

	it("carries saved days with no streak at all", () => {
		const current = record({ bank: 2 });
		expect(settle(current, DAY)).toEqual({ days: 0, bank: 2, spent: 0, broken: false });
		expect(viewStreak(current, DAY)).toMatchObject({ days: 0, bank: 2, status: "none" });
	});

	it("resumes at one after a break", () => {
		const broken = record({ streakDays: 9, throughDate: "2026-09-10" });
		expect(litQuest(broken)).toMatchObject({ streakDays: 1, throughDate: DAY });
	});
});

describe("the view", () => {
	it("reports the next saved-day target and drops it once the badge is full", () => {
		expect(viewStreak(null, DAY).questsToNextSavedDay).toBe(3);
		expect(viewStreak(record({ progressDate: DAY, taskCount: 4 }), DAY).questsToNextSavedDay).toBe(2);
		expect(viewStreak(record({ bank: 3 }), DAY).questsToNextSavedDay).toBeNull();
	});

	it("reads counters from an earlier day as zero", () => {
		const stale = record({ streakDays: 2, throughDate: YESTERDAY, progressDate: YESTERDAY, taskCount: 7, reviewCleared: true });
		expect(viewStreak(stale, DAY)).toMatchObject({ taskCount: 0, reviewCleared: false, status: "pending" });
	});

	it("shows a lit day as lit", () => {
		expect(viewStreak(litQuest(null), DAY)).toMatchObject({ days: 1, status: "lit", taskCount: 1, reviewCleared: true });
	});
});

describe("the timezone clamp", () => {
	it("refuses to move backwards past either stored date", () => {
		expect(effectiveToday(record({ streakDays: 3, throughDate: DAY }), "2026-09-16")).toBe(DAY);
		expect(effectiveToday(record({ progressDate: DAY, taskCount: 1 }), "2026-09-16")).toBe(DAY);
		expect(effectiveToday(record({ streakDays: 3, throughDate: YESTERDAY }), "2026-09-19")).toBe("2026-09-19");
	});

	it("cannot re-light a day already counted by travelling backwards", () => {
		const lit = litQuest(null);
		expect(litQuest(lit, "2026-09-16")).toMatchObject({ streakDays: 1, throughDate: DAY, taskCount: 2 });
	});

	it("settles a forward jump exactly like a real absence", () => {
		const current = record({ streakDays: 4, throughDate: YESTERDAY, bank: 1 });
		expect(settle(current, "2026-09-19")).toEqual({ days: 5, bank: 0, spent: 1, broken: false });
		expect(settle(current, "2026-09-20")).toEqual({ days: 0, bank: 0, spent: 0, broken: true });
	});
});
