/**
 * Scroll a clipped single-line label across its viewport while the pointer rests on it,
 * then glide back — the familiar "now playing" marquee. Labels that already fit stay put.
 *
 * Markup: put `data-marquee` on the clipping element — either the node the action sits on, or a
 * descendant, so a whole card can drive its title — and wrap the text in a single child element,
 * which is what gets translated. While scrolling, the viewport carries `data-marquee-active`; CSS
 * must use it to widen that child to `max-content` and drop any ellipsis.
 */

const PIXELS_PER_SECOND = 55;
const START_HOLD_MS = 550;
const END_HOLD_MS = 900;
/** Sub-pixel text metrics round up, so ignore overflow too small to be worth moving. */
const MIN_OVERFLOW_PX = 2;

function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function hoverMarquee(node: HTMLElement) {
	const viewport = node.matches("[data-marquee]") ? node : node.querySelector<HTMLElement>("[data-marquee]");
	let animation: Animation | null = null;
	let hovered = false;
	let focused = false;

	function stop() {
		animation?.cancel();
		animation = null;
		if (viewport) delete viewport.dataset.marqueeActive;
	}

	function start() {
		if (animation || !viewport || prefersReducedMotion()) return;
		const track = viewport.firstElementChild as HTMLElement | null;
		if (!track) return;

		// The active state widens the track to its full text; measure there, per hover, so
		// font loading and resizes can never leave a stale distance behind.
		viewport.dataset.marqueeActive = "true";
		const overflow = track.scrollWidth - viewport.clientWidth;
		if (overflow < MIN_OVERFLOW_PX) {
			delete viewport.dataset.marqueeActive;
			return;
		}

		const travelMs = (overflow / PIXELS_PER_SECOND) * 1000;
		const totalMs = START_HOLD_MS + 2 * travelMs + 2 * END_HOLD_MS;
		const at = (elapsedMs: number) => elapsedMs / totalMs;

		animation = track.animate(
			[
				{ offset: 0, transform: "translateX(0)" },
				{ offset: at(START_HOLD_MS), transform: "translateX(0)" },
				{ offset: at(START_HOLD_MS + travelMs), transform: `translateX(${-overflow}px)` },
				{ offset: at(START_HOLD_MS + travelMs + END_HOLD_MS), transform: `translateX(${-overflow}px)` },
				{ offset: at(START_HOLD_MS + 2 * travelMs + END_HOLD_MS), transform: "translateX(0)" },
				{ offset: 1, transform: "translateX(0)" },
			],
			{ duration: totalMs, iterations: Number.POSITIVE_INFINITY, easing: "linear" },
		);
	}

	/** Keep playing while either pointer or keyboard focus still rests on the label. */
	function sync() {
		if (hovered || focused) start();
		else stop();
	}

	const onPointerEnter = (event: PointerEvent) => {
		hovered = event.pointerType === "mouse";
		sync();
	};
	const onPointerLeave = () => {
		hovered = false;
		sync();
	};
	const onFocusIn = () => {
		focused = true;
		sync();
	};
	const onFocusOut = () => {
		focused = false;
		sync();
	};

	node.addEventListener("pointerenter", onPointerEnter);
	node.addEventListener("pointerleave", onPointerLeave);
	node.addEventListener("pointercancel", onPointerLeave);
	node.addEventListener("focusin", onFocusIn);
	node.addEventListener("focusout", onFocusOut);

	return {
		destroy() {
			node.removeEventListener("pointerenter", onPointerEnter);
			node.removeEventListener("pointerleave", onPointerLeave);
			node.removeEventListener("pointercancel", onPointerLeave);
			node.removeEventListener("focusin", onFocusIn);
			node.removeEventListener("focusout", onFocusOut);
			stop();
		},
	};
}
