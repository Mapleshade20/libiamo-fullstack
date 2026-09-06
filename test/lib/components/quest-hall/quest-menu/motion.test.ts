import { Flip } from "gsap/Flip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createQuestMenuAnimator,
	createQuestMenuBookCloseTiming,
	createQuestMenuBookOpenEase,
	createQuestMenuBookOpenTiming,
	createQuestMenuCoverLight,
	gsap,
	measureQuestMenuFit,
	prefersReducedQuestMenuMotion,
	QUEST_MENU_BOOK_SPIN_DURATION,
} from "$lib/components/quest-hall/quest-menu/motion";

describe("Quest Menu book motion", () => {
	let frame: FrameRequestCallback | null;
	beforeEach(() => {
		frame = null;
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn((callback: FrameRequestCallback) => {
				frame = callback;
				return 1;
			}),
		);
		vi.stubGlobal(
			"cancelAnimationFrame",
			vi.fn(() => {
				frame = null;
			}),
		);
	});

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
		const bounds = () => ({ width: 600, height: 400 });
		const elements = {
			homeStage: null,
			catalogStage: null,
			preparationStage: null,
			recommendationsElement: null,
			homeSlot: null,
			catalogSlot: { getBoundingClientRect: bounds },
			preparationSlot: null,
			preparationDock: null,
			preparationPanel: null,
			bookFrame: { closest: vi.fn(() => bookLayer), getBoundingClientRect: bounds },
			bookTilt: {},
			rectoProbe: null,
			bookShadow: {},
			leftHalf: { querySelectorAll: vi.fn(() => []) },
			cover: { querySelector: vi.fn(() => null) },
			turnControls: null,
			turnSheet: null,
			mobilePaper: null,
		} as any;
		const set = vi.spyOn(gsap, "set").mockImplementation(() => undefined as any);
		(vi.spyOn(gsap, "getProperty") as any).mockReturnValue(0);
		vi.spyOn(Flip, "fit").mockReturnValue({ x: 12, y: 24, scaleX: 0.8, scaleY: 0.8 } as any);

		const animator = createQuestMenuAnimator(() => elements);
		expect(animator.settle("catalog")).toBe(true);

		expect(set).toHaveBeenCalledWith(bookLayer, { autoAlpha: 1 });
		expect(set).toHaveBeenCalledWith(elements.bookFrame, expect.objectContaining({ x: 12, y: 24, scaleX: 0.8 }));
		set.mockClear();
		elements.catalogSlot = null;
		expect(animator.settle("catalog")).toBe(false);
		expect(set.mock.calls.some(([target]) => target === bookLayer)).toBe(false);
		animator.destroy();
	});

	it("keeps an unmeasurable initial book pending and accepts its fit once visible", () => {
		let width = 0;
		const element = { getBoundingClientRect: () => ({ width, height: 400 }) } as Element;
		const slot = { getBoundingClientRect: () => ({ width: 300, height: 400 }) } as Element;
		const fit = vi.spyOn(Flip, "fit").mockReturnValue({ scaleX: 0.5, scaleY: 0.5 } as any);

		expect(measureQuestMenuFit(element, slot)).toBeNull();
		expect(fit).not.toHaveBeenCalled();
		width = 600;
		expect(measureQuestMenuFit(element, slot)).toMatchObject({ scaleX: 0.5, scaleY: 0.5 });
		expect(measureQuestMenuFit(element, null)).toBeNull();
		expect(measureQuestMenuFit(element, { getBoundingClientRect: () => ({ width: 0, height: 400 }) } as Element)).toBeNull();
	});

	it.each([
		null,
		{ scaleX: 0 },
		{ scaleY: -1 },
		{ x: Number.NaN },
		{ scaleX: Number.POSITIVE_INFINITY },
	])("does not report an absent or invalid fit as ready: %j", (variables) => {
		const element = { getBoundingClientRect: () => ({ width: 300, height: 400 }) } as Element;
		vi.spyOn(Flip, "fit").mockReturnValue(variables as any);
		expect(measureQuestMenuFit(element, element)).toBeNull();
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
		frame?.(0);

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

	it("coalesces pointer events into one measurement and tween per frame, and cancels pending work on leave", () => {
		vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
		const bounds = vi.fn(() => ({ left: 0, right: 200, top: 0, bottom: 100, width: 200, height: 100 }));
		const elements = { bookTilt: {}, rectoProbe: { getBoundingClientRect: bounds } } as any;
		const to = vi.spyOn(gsap, "to").mockReturnValue({ kill: vi.fn() } as any);
		const animator = createQuestMenuAnimator(() => elements);

		animator.interactWithPointer("home", 50, 50);
		animator.interactWithPointer("home", 100, 50);
		animator.interactWithPointer("home", 200, 0);
		expect(bounds).not.toHaveBeenCalled();
		expect(requestAnimationFrame).toHaveBeenCalledOnce();
		frame?.(0);
		expect(bounds).toHaveBeenCalledOnce();
		expect(to).toHaveBeenCalledExactlyOnceWith(elements.bookTilt, expect.objectContaining({ rotateX: 2.4, rotateY: 3.2 }));

		animator.interactWithPointer("home", 20, 20);
		animator.clearPointerInteraction("home");
		expect(frame).toBeNull();
		animator.destroy();
	});

	it("does no pointer work while the book is hidden and cancels queued work on destroy", () => {
		const getElements = vi.fn(() => ({}) as any);
		const animator = createQuestMenuAnimator(getElements);
		animator.setAmbientMotionEnabled(false);
		animator.interactWithPointer("home", 100, 50);
		expect(requestAnimationFrame).not.toHaveBeenCalled();
		expect(getElements).not.toHaveBeenCalled();

		animator.setAmbientMotionEnabled(true);
		animator.interactWithPointer("home", 100, 50);
		animator.destroy();
		expect(frame).toBeNull();
	});

	it("pauses hidden idle motion, resumes its existing sway, and updates light once after both axes", () => {
		vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
		const gloss = { style: {} };
		const shade = { style: {} };
		const cover = { querySelector: vi.fn((selector) => (selector === ".cover-gloss" ? gloss : shade)) };
		const elements = {
			bookFrame: { closest: () => null },
			bookTilt: {},
			cover,
			bookShadow: {},
			leftHalf: { querySelectorAll: () => [] },
		} as any;
		const tween = { kill: vi.fn(), pause: vi.fn(), resume: vi.fn() };
		vi.spyOn(gsap, "set").mockReturnValue(undefined as any);
		(vi.spyOn(gsap, "getProperty") as any).mockReturnValue(0);
		const to = vi.spyOn(gsap, "to").mockReturnValue(tween as any);
		const add = vi.spyOn(gsap.ticker, "add").mockReturnValue(undefined as any);
		const remove = vi.spyOn(gsap.ticker, "remove").mockReturnValue(undefined as any);
		const animator = createQuestMenuAnimator(() => elements);

		animator.settle("home");
		expect(to).toHaveBeenCalledTimes(2);
		expect(add).toHaveBeenCalledOnce();
		const updateLight = add.mock.calls[0][0];
		updateLight(0, 0, 0, 0);
		expect(cover.querySelector).toHaveBeenCalledTimes(2);
		expect(gloss.style).toMatchObject({ transform: "translate(0%, 0%)", opacity: "1" });
		expect(shade.style).toMatchObject({ opacity: "1" });

		animator.setAmbientMotionEnabled(false);
		expect(tween.pause).toHaveBeenCalledTimes(2);
		expect(remove).toHaveBeenCalledWith(updateLight);
		animator.setAmbientMotionEnabled(true);
		expect(tween.resume).toHaveBeenCalledTimes(2);
		expect(to).toHaveBeenCalledTimes(2);

		animator.settle("catalog");
		animator.setAmbientMotionEnabled(false);
		animator.setAmbientMotionEnabled(true);
		expect(to).toHaveBeenCalledTimes(2);
		animator.destroy();
	});

	it("leaves the open catalog book stationary", () => {
		vi.stubGlobal("window", { matchMedia: vi.fn(() => ({ matches: false })) });
		const elements = { bookTilt: {}, bookFrame: {}, rectoProbe: {} } as any;
		const to = vi.spyOn(gsap, "to").mockImplementation(() => ({ isActive: () => false, kill: vi.fn() }) as any);

		createQuestMenuAnimator(() => elements).interactWithPointer("catalog", 100, 50);

		expect(to).not.toHaveBeenCalled();
	});
});
