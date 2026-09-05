import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createQuestMenuAnimator,
	createQuestMenuBookCloseTiming,
	createQuestMenuBookOpenEase,
	createQuestMenuBookOpenTiming,
	createQuestMenuCoverLight,
	gsap,
	prefersReducedQuestMenuMotion,
	QUEST_MENU_BOOK_SPIN_DURATION,
} from "$lib/components/quest-hall/quest-menu/motion";

describe("Quest Menu book motion", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

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

	it("restores the book layer when settling after a responsive transition", () => {
		const bookLayer = {};
		const elements = {
			homeStage: null,
			catalogStage: null,
			preparationStage: null,
			recommendationsElement: null,
			homeSlot: null,
			catalogSlot: null,
			preparationSlot: null,
			preparationDock: null,
			preparationPanel: null,
			bookFrame: { closest: vi.fn(() => bookLayer) },
			bookTilt: {},
			rectoProbe: null,
			bookShadow: {},
			leftHalf: { querySelectorAll: vi.fn(() => []) },
			cover: { style: { setProperty: vi.fn() } },
			turnControls: null,
			turnSheet: null,
			mobilePaper: null,
		} as any;
		const set = vi.spyOn(gsap, "set").mockImplementation(() => undefined as any);
		(vi.spyOn(gsap, "getProperty") as any).mockReturnValue(0);

		createQuestMenuAnimator(() => elements).settle("catalog");

		expect(set).toHaveBeenCalledWith(bookLayer, { autoAlpha: 1 });
	});

	it("tilts toward the pointer and restores the canonical book transform on leave", () => {
		vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
		const bookTilt = {};
		const tween = { isActive: vi.fn(() => false), kill: vi.fn() };
		const elements = {
			bookFrame: {},
			bookTilt,
			rectoProbe: {
				getBoundingClientRect: vi.fn(() => ({ left: 0, right: 200, top: 0, bottom: 100, width: 200, height: 100 })),
			},
		} as any;
		const to = vi.spyOn(gsap, "to").mockReturnValue(tween as any);

		const animator = createQuestMenuAnimator(() => elements);
		animator.interactWithPointer("home", 200, 0);

		expect(to).toHaveBeenCalledWith(
			bookTilt,
			expect.objectContaining({
				rotateX: 2.4,
				rotateY: 3.2,
				y: -5,
				scale: 1.006,
				ease: "power2.out",
			}),
		);

		animator.clearPointerInteraction("home");

		expect(tween.kill).toHaveBeenCalledOnce();
		expect(to).toHaveBeenLastCalledWith(
			bookTilt,
			expect.objectContaining({
				rotateX: 0,
				rotateY: 0,
				rotateZ: 0,
				y: 0,
				scale: 1,
				transformOrigin: "75% 50%",
				ease: "power3.out",
			}),
		);
	});

	it("leaves the open catalog book stationary", () => {
		vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
		const elements = { bookTilt: {}, bookFrame: {}, rectoProbe: {} } as any;
		const to = vi.spyOn(gsap, "to").mockImplementation(() => ({ isActive: () => false, kill: vi.fn() }) as any);

		createQuestMenuAnimator(() => elements).interactWithPointer("catalog", 100, 50);

		expect(to).not.toHaveBeenCalled();
	});
});
