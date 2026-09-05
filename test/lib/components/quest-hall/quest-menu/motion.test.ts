import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createQuestMenuBookCloseTiming,
	createQuestMenuBookOpenEase,
	createQuestMenuBookOpenTiming,
	createQuestMenuCoverLight,
	prefersReducedQuestMenuMotion,
	QUEST_MENU_BOOK_SPIN_DURATION,
} from "$lib/components/quest-hall/quest-menu/motion";

describe("Quest Menu book motion", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("reads the current reduced-motion preference", () => {
		vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: true })) });

		expect(prefersReducedQuestMenuMotion()).toBe(true);
	});

	it("preserves the demo opening handoff at both timing bounds", () => {
		const earliest = createQuestMenuBookOpenTiming(0);
		const latest = createQuestMenuBookOpenTiming(1);

		expect(earliest.spinDuration).toBe(QUEST_MENU_BOOK_SPIN_DURATION);
		expect(latest.spinDuration).toBe(QUEST_MENU_BOOK_SPIN_DURATION);
		expect(earliest.totalDuration).toBeCloseTo(1.24);
		expect(latest.totalDuration).toBeCloseTo(1.42);
		expect(earliest.coverStart).toBeGreaterThan(0);
		expect(latest.coverStart).toBeLessThan(QUEST_MENU_BOOK_SPIN_DURATION);
		expect(earliest.coverStart + earliest.coverDuration).toBeCloseTo(earliest.totalDuration);
		expect(latest.coverStart + latest.coverDuration).toBeCloseTo(latest.totalDuration);
	});

	it("preserves the demo closing overlap at both timing bounds", () => {
		const earliest = createQuestMenuBookCloseTiming(0);
		const latest = createQuestMenuBookCloseTiming(1);

		expect(earliest.coverDuration).toBeCloseTo(0.68);
		expect(latest.coverDuration).toBeCloseTo(0.8);
		expect(earliest.totalDuration).toBeCloseTo(earliest.coverStart + QUEST_MENU_BOOK_SPIN_DURATION);
		expect(latest.totalDuration).toBeCloseTo(latest.coverStart + QUEST_MENU_BOOK_SPIN_DURATION);
	});

	it("keeps the opening ease and cover light bounded", () => {
		const ease = createQuestMenuBookOpenEase(createQuestMenuBookOpenTiming(0.5));
		const samples = Array.from({ length: 11 }, (_, index) => ease(index / 10));

		expect(samples[0]).toBe(0);
		expect(samples.at(-1)).toBe(1);
		expect(samples).toEqual([...samples].sort((left, right) => left - right));
		expect(createQuestMenuCoverLight(5, -6)).toMatchObject({
			gloss: expect.any(Number),
			shade: expect.any(Number),
		});
	});
});
