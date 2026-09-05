import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

export type QuestMenuView = "home" | "catalog" | "prepare";

export interface QuestMenuFit {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
	skewX: number;
}

export interface QuestMenuCoverLight {
	sheenX: number;
	sheenY: number;
	gloss: number;
	shade: number;
}

export interface QuestMenuBookMotionTiming {
	spinDuration: number;
	coverStart: number;
	coverDuration: number;
	totalDuration: number;
}

export interface QuestMenuMotionElements {
	homeStage: HTMLElement | null;
	catalogStage: HTMLElement | null;
	preparationStage: HTMLElement | null;
	recommendationsElement: HTMLElement | null;
	homeSlot: HTMLElement | null;
	catalogSlot: HTMLElement | null;
	preparationSlot: HTMLElement | null;
	preparationDock: HTMLElement | null;
	preparationPanel: HTMLElement | null;
	bookFrame: HTMLElement | null;
	bookTilt: HTMLElement | null;
	rectoProbe: HTMLElement | null;
	bookShadow: HTMLElement | null;
	leftHalf: HTMLElement | null;
	cover: HTMLElement | null;
	turnControls: HTMLElement | null;
	turnSheet: HTMLElement | null;
	mobilePaper: HTMLElement | null;
}

export interface QuestMenuAnimator {
	settle: (view: QuestMenuView) => boolean;
	setAmbientMotionEnabled: (enabled: boolean) => void;
	interactWithPointer: (view: QuestMenuView, clientX: number, clientY: number) => void;
	clearPointerInteraction: (view: QuestMenuView) => void;
	transitionView: (from: QuestMenuView, view: QuestMenuView, onComplete: () => void, selectedElement?: HTMLElement) => void;
	transitionPage: (narrow: boolean, direction: -1 | 1, onHandoff: () => void, onComplete: () => void) => void;
	destroy: () => void;
}

const IDENTITY_FIT: QuestMenuFit = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0 };
export const QUEST_MENU_BOOK_SPIN_DURATION = 1.18;
export const QUEST_MENU_BOOK_FULL_TURN = -360;
export const QUEST_MENU_NARROW_MEDIA_QUERY = "(max-width: 44rem)";
export const QUEST_MENU_MOTION_TOKENS = {
	durationTurn: 0.52,
	easeOut: "power3.out",
	easeInOut: "power2.inOut",
	easeExit: "power2.in",
} as const;
export const QUEST_MENU_IDLE_SWAY = {
	pitch: 5,
	pitchPeriod: 3.3,
	yaw: 6.6,
	yawPeriod: 2.8,
} as const;
export const QUEST_MENU_POINTER_TILT = {
	lift: 5,
	pitch: 2.4,
	yaw: 3.2,
	roll: 0.16,
	scale: 1.006,
	duration: 0.26,
	returnDuration: 0.42,
} as const;
const QUEST_MENU_BOOK_RESTING_ORIGIN = "75% 50%";
const KEY_LIGHT = { x: -0.45, y: -0.6, z: 0.66 } as const;

function boundedUnit(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

export function prefersReducedQuestMenuMotion(): boolean {
	return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createQuestMenuCoverLight(rotateX: number, rotateY: number): QuestMenuCoverLight {
	const yaw = Math.sin((rotateY * Math.PI) / 180);
	const pitch = Math.sin((rotateX * Math.PI) / 180);
	const lit = (KEY_LIGHT.x * yaw - KEY_LIGHT.y * pitch) / KEY_LIGHT.z;
	return {
		sheenX: 32 - 4 * rotateY,
		sheenY: 26 + 3.6 * rotateX,
		gloss: clamp(1 + lit * 3.1, 0.35, 1.6),
		shade: clamp(1 - lit * 2.2, 0.3, 1.7),
	};
}

export const QUEST_MENU_COVER_LIGHT_REST = createQuestMenuCoverLight(0, 0);

export function createQuestMenuBookOpenTiming(randomValue = Math.random()): QuestMenuBookMotionTiming {
	const random = boundedUnit(randomValue);
	const remainingSpinDegrees = 46 + random * 10;
	const coverStart = QUEST_MENU_BOOK_SPIN_DURATION * (1 - Math.cbrt(remainingSpinDegrees / 1440));
	const totalDuration = QUEST_MENU_BOOK_SPIN_DURATION + 0.06 + random * 0.18;

	return {
		spinDuration: QUEST_MENU_BOOK_SPIN_DURATION,
		coverStart,
		coverDuration: totalDuration - coverStart,
		totalDuration,
	};
}

export function createQuestMenuBookOpenEase(timing: QuestMenuBookMotionTiming): (progress: number) => number {
	const spinProgress = boundedUnit(timing.coverStart / timing.spinDuration);
	const spinProgressPerSecond = (12 * (1 - spinProgress) ** 2) / timing.spinDuration;
	const initialSlope = 2 * spinProgressPerSecond * timing.coverDuration;

	return (value: number) => {
		const progress = boundedUnit(value);
		return (-2 + initialSlope) * progress ** 3 + (3 - 2 * initialSlope) * progress ** 2 + initialSlope * progress;
	};
}

export function createQuestMenuBookCloseTiming(randomValue = Math.random()): QuestMenuBookMotionTiming {
	const random = boundedUnit(randomValue);
	const coverDuration = 0.68 + random * 0.12;
	const joinedAfterDegrees = 20 + random * 15;
	const coverStart = coverDuration * Math.sqrt(joinedAfterDegrees / 360);

	return {
		spinDuration: QUEST_MENU_BOOK_SPIN_DURATION,
		coverStart,
		coverDuration,
		totalDuration: coverStart + QUEST_MENU_BOOK_SPIN_DURATION,
	};
}

export function measureQuestMenuFit(element: Element, slot: Element | null | undefined, probe?: Element | null): QuestMenuFit | null {
	if (!slot) return null;
	const bounds = slot.getBoundingClientRect();
	const sourceBounds = element.getBoundingClientRect();
	if (bounds.width <= 0 || bounds.height <= 0 || sourceBounds.width <= 0 || sourceBounds.height <= 0) return null;
	const variables = Flip.fit(element, slot, { scale: true, getVars: true, ...(probe ? { fitChild: probe } : {}) }) as Partial<QuestMenuFit> | null;
	if (!variables) return null;
	const fit = {
		x: variables.x ?? 0,
		y: variables.y ?? 0,
		scaleX: variables.scaleX ?? 1,
		scaleY: variables.scaleY ?? 1,
		rotation: variables.rotation ?? 0,
		skewX: variables.skewX ?? 0,
	};
	return Object.values(fit).every(Number.isFinite) && fit.scaleX > 0 && fit.scaleY > 0 ? fit : null;
}

export function createQuestMenuAnimator(getElements: () => QuestMenuMotionElements): QuestMenuAnimator {
	let viewTimeline: gsap.core.Timeline | null = null;
	let idleTweens: gsap.core.Tween[] = [];
	let turnTimeline: gsap.core.Timeline | null = null;
	let pointerTween: gsap.core.Tween | null = null;
	let pointerActive = false;
	let settledView: QuestMenuView = "home";
	let ambientMotionEnabled = true;
	let pointerFrame = 0;
	let pendingPointer: { view: QuestMenuView; clientX: number; clientY: number } | null = null;
	let lightCover: HTMLElement | null = null;
	let coverGloss: HTMLElement | null = null;
	let coverShade: HTMLElement | null = null;

	function stopIdle(): void {
		gsap.ticker.remove(setCoverLight);
		for (const tween of idleTweens) tween.kill();
		idleTweens = [];
	}

	function setCoverLight(): void {
		const { cover, bookTilt } = getElements();
		if (!cover || !bookTilt) return;
		if (lightCover !== cover) {
			lightCover = cover;
			coverGloss = cover.querySelector<HTMLElement>(".cover-gloss");
			coverShade = cover.querySelector<HTMLElement>(".cover-shade");
		}
		const light = createQuestMenuCoverLight(Number(gsap.getProperty(bookTilt, "rotateX")), Number(gsap.getProperty(bookTilt, "rotateY")));
		// Move a pre-painted ellipse rather than repainting a radial gradient or
		// invalidating inherited custom properties throughout both book faces.
		if (coverGloss) {
			coverGloss.style.transform = `translate(${(light.sheenX - QUEST_MENU_COVER_LIGHT_REST.sheenX) / 1.24}%, ${(light.sheenY - QUEST_MENU_COVER_LIGHT_REST.sheenY) / 1.16}%)`;
			coverGloss.style.opacity = String(light.gloss);
		}
		if (coverShade) coverShade.style.opacity = String(light.shade);
	}

	function startIdle(): void {
		const { bookTilt } = getElements();
		stopIdle();
		if (!bookTilt || !ambientMotionEnabled) return;
		if (prefersReducedQuestMenuMotion()) {
			gsap.set(bookTilt, { rotateX: 0, rotateY: 0, rotateZ: 0 });
			setCoverLight();
			return;
		}
		gsap.set(bookTilt, { rotateZ: 0 });
		idleTweens = [
			gsap.to(bookTilt, {
				rotateX: `random(${-QUEST_MENU_IDLE_SWAY.pitch}, ${QUEST_MENU_IDLE_SWAY.pitch}, 0.1)`,
				duration: QUEST_MENU_IDLE_SWAY.pitchPeriod,
				ease: "sine.inOut",
				repeat: -1,
				repeatRefresh: true,
			}),
			gsap.to(bookTilt, {
				rotateY: `random(${-QUEST_MENU_IDLE_SWAY.yaw}, ${QUEST_MENU_IDLE_SWAY.yaw}, 0.1)`,
				duration: QUEST_MENU_IDLE_SWAY.yawPeriod,
				ease: "sine.inOut",
				repeat: -1,
				repeatRefresh: true,
			}),
		];
		// The ticker runs after both axis tweens: one lighting update per frame.
		gsap.ticker.add(setCoverLight);
	}

	function cancelPointerFrame(): void {
		if (pointerFrame) cancelAnimationFrame(pointerFrame);
		pointerFrame = 0;
		pendingPointer = null;
	}

	function setAmbientMotionEnabled(enabled: boolean): void {
		if (ambientMotionEnabled === enabled) return;
		ambientMotionEnabled = enabled;
		if (!enabled) {
			cancelPointerFrame();
			gsap.ticker.remove(setCoverLight);
			for (const tween of idleTweens) tween.pause();
			if (pointerActive || pointerTween) stopPointerInteraction(true);
		} else if (settledView === "home" && !viewTimeline?.isActive() && !turnTimeline?.isActive()) {
			if (idleTweens.length) {
				for (const tween of idleTweens) tween.resume();
				gsap.ticker.add(setCoverLight);
			} else startIdle();
		}
	}

	function stopPointerInteraction(reset: boolean): void {
		cancelPointerFrame();
		pointerActive = false;
		pointerTween?.kill();
		pointerTween = null;
		if (!reset) return;
		const { bookTilt } = getElements();
		if (!bookTilt) return;
		gsap.set(bookTilt, {
			rotateX: 0,
			rotateY: 0,
			rotateZ: 0,
			y: 0,
			scale: 1,
			transformOrigin: QUEST_MENU_BOOK_RESTING_ORIGIN,
		});
		setCoverLight();
	}

	function pointerSurface(elements: QuestMenuMotionElements): HTMLElement | null {
		return elements.rectoProbe ?? elements.bookFrame;
	}

	function applyPointerInteraction(view: QuestMenuView, clientX: number, clientY: number): void {
		const elements = getElements();
		if (view !== "home") {
			if (pointerActive) stopPointerInteraction(true);
			return;
		}
		if (!elements.bookTilt || viewTimeline?.isActive() || turnTimeline?.isActive() || prefersReducedQuestMenuMotion()) {
			if (pointerActive) stopPointerInteraction(true);
			return;
		}
		const surface = pointerSurface(elements);
		if (!surface) return;
		const bounds = surface.getBoundingClientRect();
		if (
			bounds.width <= 0 ||
			bounds.height <= 0 ||
			clientX < bounds.left ||
			clientX > bounds.right ||
			clientY < bounds.top ||
			clientY > bounds.bottom
		) {
			clearPointerInteraction(view);
			return;
		}

		if (!pointerActive) {
			pointerActive = true;
			stopIdle();
		}
		const horizontal = clamp(((clientX - bounds.left) / bounds.width - 0.5) * 2, -1, 1);
		const vertical = clamp(((clientY - bounds.top) / bounds.height - 0.5) * 2, -1, 1);
		const originX = 75 + horizontal * 2.4;
		const originY = 50 + vertical * 2;
		pointerTween = gsap.to(elements.bookTilt, {
			rotateX: -vertical * QUEST_MENU_POINTER_TILT.pitch,
			rotateY: horizontal * QUEST_MENU_POINTER_TILT.yaw,
			rotateZ: horizontal * QUEST_MENU_POINTER_TILT.roll,
			y: -QUEST_MENU_POINTER_TILT.lift,
			scale: QUEST_MENU_POINTER_TILT.scale,
			transformOrigin: `${originX}% ${originY}%`,
			duration: QUEST_MENU_POINTER_TILT.duration,
			ease: "power2.out",
			overwrite: "auto",
			onUpdate: setCoverLight,
		});
	}

	function interactWithPointer(view: QuestMenuView, clientX: number, clientY: number): void {
		if (!ambientMotionEnabled || view !== "home") return;
		pendingPointer = { view, clientX, clientY };
		if (pointerFrame) return;
		pointerFrame = requestAnimationFrame(() => {
			pointerFrame = 0;
			const pointer = pendingPointer;
			pendingPointer = null;
			if (pointer) applyPointerInteraction(pointer.view, pointer.clientX, pointer.clientY);
		});
	}

	function clearPointerInteraction(view: QuestMenuView): void {
		cancelPointerFrame();
		if (!pointerActive) return;
		pointerActive = false;
		pointerTween?.kill();
		pointerTween = null;
		const { bookTilt } = getElements();
		if (!bookTilt) return;
		if (prefersReducedQuestMenuMotion()) {
			stopPointerInteraction(true);
			return;
		}
		pointerTween = gsap.to(bookTilt, {
			rotateX: 0,
			rotateY: 0,
			rotateZ: 0,
			y: 0,
			scale: 1,
			transformOrigin: QUEST_MENU_BOOK_RESTING_ORIGIN,
			duration: QUEST_MENU_POINTER_TILT.returnDuration,
			ease: "power3.out",
			overwrite: "auto",
			onUpdate: setCoverLight,
			onComplete: () => {
				pointerTween = null;
				if (!pointerActive && settledView === view && view === "home") startIdle();
			},
		});
	}

	function targetFit(view: QuestMenuView, elements: QuestMenuMotionElements): QuestMenuFit | null {
		if (!elements.bookFrame) return null;
		return measureQuestMenuFit(
			elements.bookFrame,
			view === "home" ? elements.homeSlot : view === "catalog" ? elements.catalogSlot : elements.preparationSlot,
			view === "catalog" ? undefined : elements.rectoProbe,
		);
	}

	function leftHalfParts(element: HTMLElement): HTMLElement[] {
		return Array.from(element.querySelectorAll<HTMLElement>(".book-surface"));
	}

	function settle(view: QuestMenuView): boolean {
		const elements = getElements();
		if (!elements.bookFrame || !elements.bookTilt || !elements.cover || !elements.leftHalf || !elements.bookShadow) return false;
		settledView = view;
		stopIdle();
		stopPointerInteraction(false);
		viewTimeline?.kill();
		turnTimeline?.kill();
		turnTimeline = null;
		if (elements.turnSheet) gsap.set(elements.turnSheet, { autoAlpha: 0, left: "auto", right: "0%", rotateY: 0, z: 0 });
		if (elements.mobilePaper) gsap.set(elements.mobilePaper, { autoAlpha: 1, x: 0, y: 0, rotateZ: 0, scale: 1 });
		const bookLayer = elements.bookFrame.closest<HTMLElement>(".book-layer");
		const fit = targetFit(view, elements);
		if (fit) {
			if (bookLayer) gsap.set(bookLayer, { autoAlpha: 1 });
			gsap.set(elements.bookFrame, { ...fit, rotation: 0, skewX: 0, autoAlpha: 1 });
		}
		const open = view === "catalog";
		gsap.set(elements.cover, { rotateY: open ? -180 : 0 });
		gsap.set(leftHalfParts(elements.leftHalf), { autoAlpha: open ? 1 : 0 });
		if (elements.turnControls) gsap.set(elements.turnControls, { autoAlpha: open ? 1 : 0 });
		gsap.set(elements.bookShadow, { autoAlpha: 1, z: -2, scaleX: open ? 1 : 0.52, transformOrigin: "right center" });
		gsap.set(elements.bookTilt, {
			rotateX: 0,
			rotateY: 0,
			rotateZ: 0,
			y: 0,
			scale: 1,
			transformOrigin: QUEST_MENU_BOOK_RESTING_ORIGIN,
		});
		if (elements.homeStage) gsap.set(elements.homeStage, { autoAlpha: view === "home" ? 1 : 0, pointerEvents: view === "home" ? "auto" : "none" });
		if (elements.catalogStage)
			gsap.set(elements.catalogStage, { autoAlpha: view === "catalog" ? 1 : 0, pointerEvents: view === "catalog" ? "auto" : "none" });
		if (elements.preparationStage)
			gsap.set(elements.preparationStage, { autoAlpha: view === "prepare" ? 1 : 0, pointerEvents: view === "prepare" ? "auto" : "none" });
		if (elements.recommendationsElement) gsap.set(elements.recommendationsElement, { autoAlpha: view === "home" ? 1 : 0, x: 0 });
		if (elements.preparationDock) gsap.set(elements.preparationDock, { autoAlpha: view === "prepare" ? 1 : 0 });
		if (elements.preparationPanel) gsap.set(elements.preparationPanel, { autoAlpha: view === "prepare" ? 1 : 0, x: 0 });
		setCoverLight();
		if (view === "home") startIdle();
		return fit !== null;
	}

	function addCoverSwing(
		timeline: gsap.core.Timeline,
		cover: HTMLElement,
		leftHalf: HTMLElement,
		bookShadow: HTMLElement,
		turnControls: HTMLElement | null,
		open: boolean,
		at: number,
		duration: number,
		ease: string | ((progress: number) => number),
	): void {
		timeline.to(cover, { rotateY: open ? -180 : 0, duration, ease }, at);
		const parts = leftHalfParts(leftHalf);
		if (open) timeline.to(parts, { autoAlpha: 1, duration: duration * 0.3 }, at + duration * 0.62);
		else timeline.to(parts, { autoAlpha: 0, duration: duration * 0.26 }, at + duration * 0.06);
		if (turnControls) timeline.to(turnControls, { autoAlpha: open ? 1 : 0, duration: duration * 0.3 }, open ? at + duration * 0.62 : at);
		timeline.to(bookShadow, { scaleX: open ? 1 : 0.52, duration, ease }, at);
	}

	function transitionView(from: QuestMenuView, view: QuestMenuView, onComplete: () => void, selectedElement?: HTMLElement): void {
		const elements = getElements();
		if (
			!elements.bookFrame ||
			!elements.bookTilt ||
			!elements.cover ||
			!elements.leftHalf ||
			!elements.bookShadow ||
			!elements.homeStage ||
			!elements.catalogStage ||
			!elements.preparationStage
		) {
			settle(view);
			onComplete();
			return;
		}
		if (prefersReducedQuestMenuMotion()) {
			settle(view);
			onComplete();
			return;
		}
		stopIdle();
		stopPointerInteraction(true);
		viewTimeline?.kill();
		turnTimeline?.kill();
		turnTimeline = null;
		if (elements.turnSheet) gsap.set(elements.turnSheet, { autoAlpha: 0, left: "auto", right: "0%", rotateY: 0, z: 0 });
		const stages: Record<QuestMenuView, HTMLElement> = {
			home: elements.homeStage,
			catalog: elements.catalogStage,
			prepare: elements.preparationStage,
		};
		const fromStage = stages[from];
		const toStage = stages[view];
		const idleStage = Object.entries(stages).find(([stageView]) => stageView !== from && stageView !== view)?.[1];
		const narrow = window.matchMedia(QUEST_MENU_NARROW_MEDIA_QUERY).matches;
		const bookLayer = elements.bookFrame.closest<HTMLElement>(".book-layer");
		const fit = targetFit(view, elements) ?? IDENTITY_FIT;
		let bookEnd: number = QUEST_MENU_MOTION_TOKENS.durationTurn;
		const timeline = gsap.timeline({
			defaults: { ease: QUEST_MENU_MOTION_TOKENS.easeInOut },
			onComplete: () => {
				viewTimeline = null;
				settle(view);
				onComplete();
			},
		});
		viewTimeline = timeline;
		if (idleStage) timeline.set(idleStage, { autoAlpha: 0, pointerEvents: "none" }, 0);
		timeline.set(fromStage, { autoAlpha: 1, pointerEvents: "none" }, 0);
		timeline.set(toStage, { autoAlpha: 0, visibility: "visible", pointerEvents: "none" }, 0);
		const bookLeaves = view === "catalog" && narrow;
		const bookReturns = from === "catalog" && narrow;
		const opening = view === "catalog" && from !== "catalog" && !narrow;
		const closing = from === "catalog" && view !== "catalog" && !narrow;
		if (bookLeaves) {
			if (bookLayer) timeline.set(bookLayer, { autoAlpha: 0 }, 0);
			bookEnd = 0.24;
		} else if (bookReturns) {
			timeline.set(elements.bookFrame, { ...fit, rotation: 0, skewX: 0 }, 0.1);
			timeline.set(elements.bookTilt, { rotateX: 0, rotateY: 0, rotateZ: 0 }, 0.1);
			timeline.set(elements.cover, { rotateY: 0 }, 0.1);
			timeline.set(leftHalfParts(elements.leftHalf), { autoAlpha: 0 }, 0.1);
			if (elements.turnControls) timeline.set(elements.turnControls, { autoAlpha: 0 }, 0.1);
			timeline.set(elements.bookShadow, { autoAlpha: 1, scaleX: 0.52 }, 0.1);
			if (bookLayer) {
				timeline.set(bookLayer, { autoAlpha: 0 }, 0);
				timeline.to(bookLayer, { autoAlpha: 1, duration: 0.28, ease: QUEST_MENU_MOTION_TOKENS.easeOut }, 0.14);
			}
			bookEnd = 0.46;
		} else if (opening) {
			const timing = createQuestMenuBookOpenTiming();
			timeline.to(elements.bookFrame, { ...fit, duration: timing.spinDuration }, 0);
			timeline.to(elements.bookTilt, { rotateX: 0, rotateY: QUEST_MENU_BOOK_FULL_TURN, rotateZ: 0, duration: timing.spinDuration }, 0);
			timeline.set(elements.bookTilt, { rotateY: 0 }, timing.spinDuration);
			addCoverSwing(
				timeline,
				elements.cover,
				elements.leftHalf,
				elements.bookShadow,
				elements.turnControls,
				true,
				timing.coverStart,
				timing.coverDuration,
				createQuestMenuBookOpenEase(timing),
			);
			bookEnd = Math.max(timing.spinDuration, timing.totalDuration);
		} else if (closing) {
			const timing = createQuestMenuBookCloseTiming();
			addCoverSwing(
				timeline,
				elements.cover,
				elements.leftHalf,
				elements.bookShadow,
				elements.turnControls,
				false,
				0,
				timing.coverDuration,
				"power1.inOut",
			);
			timeline.to(elements.bookFrame, { ...fit, duration: timing.spinDuration }, timing.coverStart);
			timeline.set(elements.bookTilt, { rotateY: QUEST_MENU_BOOK_FULL_TURN }, timing.coverStart);
			timeline.to(elements.bookTilt, { rotateX: 0, rotateY: 0, rotateZ: 0, duration: timing.spinDuration }, timing.coverStart);
			bookEnd = timing.totalDuration;
		} else {
			bookEnd = 0.72;
			timeline.to(elements.bookFrame, { ...fit, duration: bookEnd }, 0);
			timeline.to(elements.bookTilt, { rotateX: 0, rotateY: 0, rotateZ: 0, duration: bookEnd }, 0);
		}

		const chromeIn = Math.max(0.2, bookEnd - 0.36);
		timeline.to(fromStage, { autoAlpha: 0, pointerEvents: "none", duration: 0.24 }, 0.04);
		timeline.set(toStage, { autoAlpha: 1 }, chromeIn);
		if (selectedElement) {
			const surface = selectedElement.closest<HTMLElement>(".task-card, .recommendation-card") ?? selectedElement;
			timeline.to(surface, { y: -7, scale: 1.01, duration: 0.12, ease: QUEST_MENU_MOTION_TOKENS.easeOut }, 0);
			timeline.to(surface, { y: 0, scale: 1, duration: 0.16 }, 0.12);
		}
		if (elements.recommendationsElement) {
			if (from === "home")
				timeline.to(elements.recommendationsElement, { autoAlpha: 0, x: -28, duration: 0.3, ease: QUEST_MENU_MOTION_TOKENS.easeExit }, 0);
			if (view === "home") {
				timeline.set(elements.recommendationsElement, { autoAlpha: 0, x: -28 }, 0);
				timeline.to(elements.recommendationsElement, { autoAlpha: 1, x: 0, duration: 0.34, ease: QUEST_MENU_MOTION_TOKENS.easeOut }, chromeIn);
			}
		}
		if (elements.preparationDock) {
			if (from === "prepare") timeline.to(elements.preparationDock, { autoAlpha: 0, duration: 0.2, ease: QUEST_MENU_MOTION_TOKENS.easeExit }, 0);
			if (view === "prepare") {
				timeline.set(elements.preparationDock, { autoAlpha: 0 }, 0);
				timeline.to(elements.preparationDock, { autoAlpha: 1, duration: 0.24, ease: QUEST_MENU_MOTION_TOKENS.easeOut }, chromeIn);
			}
		}
		if (elements.preparationPanel) {
			if (from === "prepare")
				timeline.to(elements.preparationPanel, { autoAlpha: 0, x: 28, duration: 0.26, ease: QUEST_MENU_MOTION_TOKENS.easeExit }, 0);
			if (view === "prepare") {
				timeline.set(elements.preparationPanel, { autoAlpha: 0, x: narrow ? 0 : 36 }, 0);
				timeline.to(elements.preparationPanel, { autoAlpha: 1, x: 0, duration: 0.4, ease: QUEST_MENU_MOTION_TOKENS.easeOut }, chromeIn + 0.04);
			}
		}
		timeline.call(() => undefined, [], Math.max(bookEnd, chromeIn + 0.44));
	}

	function transitionPage(narrow: boolean, direction: -1 | 1, onHandoff: () => void, onComplete: () => void): void {
		stopPointerInteraction(true);
		turnTimeline?.kill();
		const elements = getElements();
		if (narrow && elements.mobilePaper) {
			const exitX = direction > 0 ? -38 : 38;
			const enterX = direction > 0 ? 58 : -42;
			turnTimeline = gsap
				.timeline({ defaults: { ease: QUEST_MENU_MOTION_TOKENS.easeInOut } })
				.to(elements.mobilePaper, {
					autoAlpha: 0,
					x: exitX,
					scale: 0.975,
					rotateZ: direction * 0.7,
					duration: 0.2,
					ease: QUEST_MENU_MOTION_TOKENS.easeExit,
				})
				.call(onHandoff, [], 0.2)
				.set(elements.mobilePaper, { x: enterX, scale: 0.95, rotateZ: direction * -0.8 }, 0.21)
				.to(elements.mobilePaper, { autoAlpha: 1, x: 0, scale: 1, rotateZ: 0, duration: 0.36, ease: QUEST_MENU_MOTION_TOKENS.easeOut }, 0.22)
				.call(onComplete);
			return;
		}
		if (!elements.turnSheet) {
			onHandoff();
			onComplete();
			return;
		}
		gsap.set(elements.turnSheet, {
			autoAlpha: 1,
			left: direction > 0 ? "auto" : "0%",
			right: direction > 0 ? "0%" : "auto",
			rotateY: 0,
			z: 0,
			transformOrigin: direction > 0 ? "left center" : "right center",
		});
		const turnDuration = QUEST_MENU_MOTION_TOKENS.durationTurn;
		const turnMidpoint = turnDuration / 2;
		turnTimeline = gsap
			.timeline({ defaults: { ease: QUEST_MENU_MOTION_TOKENS.easeInOut } })
			.to(elements.turnSheet, { rotateY: direction * -180, duration: turnDuration }, 0)
			.to(elements.turnSheet, { z: 12, duration: turnMidpoint, ease: QUEST_MENU_MOTION_TOKENS.easeOut }, 0)
			.to(elements.turnSheet, { z: 0, duration: turnMidpoint, ease: QUEST_MENU_MOTION_TOKENS.easeExit }, turnMidpoint)
			.call(onHandoff, [], turnMidpoint)
			.set(elements.turnSheet, { autoAlpha: 0, left: "auto", right: "0%", rotateY: 0, z: 0 }, turnDuration)
			.call(onComplete, [], turnDuration);
	}

	function destroy(): void {
		viewTimeline?.kill();
		turnTimeline?.kill();
		stopPointerInteraction(false);
		stopIdle();
	}

	return { settle, setAmbientMotionEnabled, interactWithPointer, clearPointerInteraction, transitionView, transitionPage, destroy };
}

export { gsap };
