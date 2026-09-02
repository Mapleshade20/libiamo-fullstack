import { gsap } from "gsap";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(Flip);

export type CarteMotionStopMode = "hold" | "reset" | "finish";

export interface CarteFitVars {
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
	skewX: number;
}

const IDENTITY_FIT: CarteFitVars = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skewX: 0 };

/**
 * Measures the transform that drops `element` onto `slot` without applying it,
 * so the caller can schedule it inside a larger timeline. `probe` lets a wider
 * element (the open spread) be aligned by one of its halves instead.
 */
export function measureCarteFit(element: Element, slot: Element | null | undefined, probe?: Element | null): CarteFitVars {
	if (!slot) return IDENTITY_FIT;
	const slotBounds = slot.getBoundingClientRect();
	if (slotBounds.width <= 0 || slotBounds.height <= 0) return IDENTITY_FIT;

	const vars = Flip.fit(element, slot, { scale: true, getVars: true, ...(probe ? { fitChild: probe } : {}) }) as Partial<CarteFitVars> | null;
	if (!vars) return IDENTITY_FIT;
	return {
		x: vars.x ?? 0,
		y: vars.y ?? 0,
		scaleX: vars.scaleX ?? 1,
		scaleY: vars.scaleY ?? 1,
		rotation: vars.rotation ?? 0,
		skewX: vars.skewX ?? 0,
	};
}

export const CARTE_MOTION_TOKENS = {
	durationFast: 0.18,
	durationStandard: 0.42,
	durationTurn: 0.52,
	durationCeremonial: 0.68,
	durationExit: 0.24,
	easeOut: "power3.out",
	easeInOut: "power2.inOut",
	easeExit: "power2.in",
	perspective: 1600,
} as const;

const activeByElement = new WeakMap<Element, gsap.core.Animation>();

function chainAnimationCallback(animation: gsap.core.Animation, type: gsap.CallbackType, callback: () => void) {
	const previous = animation.eventCallback(type);
	animation.eventCallback(type, (...args: unknown[]) => {
		previous?.(...args);
		callback();
	});
}

export function prefersReducedCarteMotion(forceReduced = false): boolean {
	if (forceReduced) return true;
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stopAnimation(animation: gsap.core.Animation, mode: CarteMotionStopMode) {
	if (mode === "finish") {
		animation.progress(1).kill();
		return;
	}
	if (mode === "reset") {
		animation.revert();
		return;
	}
	animation.kill();
}

function reducedVars(vars: gsap.TweenVars, reduced: boolean): gsap.TweenVars {
	if (!reduced) return vars;
	return {
		...vars,
		delay: 0,
		duration: 0,
		stagger: 0,
	};
}

export function stopCarteMotion(target: Element, mode: CarteMotionStopMode = "hold") {
	const animation = activeByElement.get(target);
	if (!animation) return;
	stopAnimation(animation, mode);
	activeByElement.delete(target);
}

export function animateCarte(target: Element, vars: gsap.TweenVars, options: { reduced?: boolean; replace?: boolean } = {}): gsap.core.Tween {
	const reduced = prefersReducedCarteMotion(options.reduced);
	if (options.replace !== false) stopCarteMotion(target);
	const tween = gsap.to(target, reducedVars(vars, reduced));
	activeByElement.set(target, tween);
	chainAnimationCallback(tween, "onComplete", () => {
		if (activeByElement.get(target) === tween) activeByElement.delete(target);
	});
	chainAnimationCallback(tween, "onInterrupt", () => {
		if (activeByElement.get(target) === tween) activeByElement.delete(target);
	});
	return tween;
}

export interface CarteMotionScope {
	to: (targets: gsap.TweenTarget, vars: gsap.TweenVars) => gsap.core.Tween;
	fromTo: (targets: gsap.TweenTarget, fromVars: gsap.TweenVars, toVars: gsap.TweenVars) => gsap.core.Tween;
	set: (targets: gsap.TweenTarget, vars: gsap.TweenVars) => gsap.core.Tween;
	timeline: (vars?: gsap.TimelineVars) => gsap.core.Timeline;
	matchMedia: () => gsap.MatchMedia;
	stopAll: (mode?: CarteMotionStopMode) => void;
	revert: () => void;
}

export function createCarteMotionScope(scope?: Element | string): CarteMotionScope {
	const context = gsap.context(() => {}, scope);
	const animations = new Set<gsap.core.Animation>();
	const media = gsap.matchMedia(scope);

	function track<T extends gsap.core.Animation>(factory: () => T): T {
		const animation = context.add(factory);
		animations.add(animation);
		chainAnimationCallback(animation, "onComplete", () => animations.delete(animation));
		chainAnimationCallback(animation, "onReverseComplete", () => animations.delete(animation));
		chainAnimationCallback(animation, "onInterrupt", () => animations.delete(animation));
		return animation;
	}

	return {
		to(targets, vars) {
			return track(() => gsap.to(targets, vars));
		},
		fromTo(targets, fromVars, toVars) {
			return track(() => gsap.fromTo(targets, fromVars, toVars));
		},
		set(targets, vars) {
			return track(() => gsap.set(targets, vars));
		},
		timeline(vars) {
			return track(() => gsap.timeline(vars));
		},
		matchMedia() {
			return media;
		},
		stopAll(mode = "hold") {
			for (const animation of animations) stopAnimation(animation, mode);
			animations.clear();
		},
		revert() {
			animations.clear();
			media.revert();
			context.revert();
		},
	};
}

export { Flip, gsap };
