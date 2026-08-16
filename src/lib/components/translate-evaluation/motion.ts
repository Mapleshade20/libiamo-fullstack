import { type AnimationPlaybackControls, animate } from "motion";
import { MOTION_TOKENS } from "./types";

export function prefersReducedMotion(): boolean {
	if (typeof window === "undefined") return false;
	// Demo force flag: documentElement class set by translate-eval-demo
	if (document.documentElement.classList.contains("demo-force-reduced")) return true;
	if (typeof window.matchMedia !== "function") return false;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type Cancelable = { stop: () => void };

/** Stop a list of motion controls safely. */
export function stopAll(controls: Array<AnimationPlaybackControls | Cancelable | null | undefined>) {
	for (const c of controls) {
		try {
			c?.stop();
		} catch {
			// ignore already-finished controls
		}
	}
}

/**
 * Animate SVG path drawing via pathLength.
 * Returns controls so the caller can cancel on destroy / scene change.
 */
export function drawPath(
	el: SVGPathElement | SVGGeometryElement,
	opts: { duration?: number; delay?: number; reduced?: boolean } = {},
): AnimationPlaybackControls {
	const reduced = opts.reduced ?? prefersReducedMotion();
	if (reduced) {
		el.style.strokeDasharray = "none";
		el.style.strokeDashoffset = "0";
		el.style.opacity = "1";
		return animate(el, { opacity: [0.4, 1] }, { duration: 0.2 });
	}
	// pathLength is a Motion SVG attribute; cast keeps TS happy across Element/SVG unions.
	return animate(el, { pathLength: [0, 1], opacity: [0, 1] } as Record<string, number[]>, {
		duration: opts.duration ?? MOTION_TOKENS.durationSlow,
		delay: opts.delay ?? 0,
		ease: [...MOTION_TOKENS.easeInOut] as [number, number, number, number],
	});
}

/**
 * Fade + slight rise enter for result panels.
 */
export function revealPanel(el: HTMLElement, opts: { delay?: number; reduced?: boolean } = {}): AnimationPlaybackControls {
	const reduced = opts.reduced ?? prefersReducedMotion();
	if (reduced) {
		return animate(el, { opacity: [0, 1] }, { duration: 0.18, delay: opts.delay ?? 0 });
	}
	return animate(
		el,
		{ opacity: [0, 1], y: [10, 0] },
		{
			duration: MOTION_TOKENS.duration,
			delay: opts.delay ?? 0,
			ease: [...MOTION_TOKENS.easeOut] as [number, number, number, number],
		},
	);
}

/**
 * Highlighter ink-reveal: background grows left-to-right under the span.
 */
export function revealHighlight(el: HTMLElement, opts: { delay?: number; reduced?: boolean } = {}): AnimationPlaybackControls {
	const reduced = opts.reduced ?? prefersReducedMotion();
	if (reduced) {
		el.style.backgroundSize = "100% 100%";
		return animate(el, { opacity: [0.5, 1] }, { duration: 0.15, delay: opts.delay ?? 0 });
	}
	el.style.backgroundSize = "0% 100%";
	el.style.backgroundRepeat = "no-repeat";
	return animate(
		el,
		{ backgroundSize: ["0% 100%", "100% 100%"] },
		{
			duration: MOTION_TOKENS.durationSlow,
			delay: opts.delay ?? 0,
			ease: [...MOTION_TOKENS.easeOut] as [number, number, number, number],
		},
	);
}
