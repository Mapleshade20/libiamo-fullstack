/**
 * How an acknowledged announcement reaches the collection: its card closes into a dot where it
 * sits, the dot is tossed into the collection's mark, and the mark's two quotes take the catch.
 * Every step resolves at once under reduced motion, so callers can always await them.
 */

const DOT_SIZE = 14;

function reducedMotion(): boolean {
	return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Clips the card down to a dot at its centre and fades its contents out. */
export async function collapseToDot(card: HTMLElement, color: string): Promise<void> {
	if (reducedMotion()) return;
	const { width, height } = card.getBoundingClientRect();
	const x = Math.max(0, (width - DOT_SIZE) / 2);
	const y = Math.max(0, (height - DOT_SIZE) / 2);
	for (const child of card.children) child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-out", fill: "forwards" });
	await card.animate(
		[
			{ clipPath: `inset(0px 0px 0px 0px round ${getComputedStyle(card).borderRadius})` },
			{ clipPath: `inset(${y}px ${x}px ${y}px ${x}px round ${DOT_SIZE / 2}px)`, backgroundColor: color },
		],
		{ duration: 340, easing: "cubic-bezier(0.32, 0, 0.2, 1)", fill: "forwards" },
	).finished;
}

/**
 * Throws the (collapsed) card so its centre lands on `target`'s. Horizontal speed is constant and
 * the height follows a parabola, so the dot rises, hangs for a moment and drops in like a thrown
 * object. It vanishes in the last stretch, as it goes in.
 */
export async function tossInto(card: HTMLElement, target: DOMRect): Promise<void> {
	if (reducedMotion()) return;
	const from = card.getBoundingClientRect();
	const dx = target.left + target.width / 2 - (from.left + from.width / 2);
	const dy = target.top + target.height / 2 - (from.top + from.height / 2);
	const distance = Math.hypot(dx, dy);
	const lift = Math.max(56, distance * 0.28);
	const steps = 24;
	const frames = Array.from({ length: steps + 1 }, (_, index) => {
		const t = index / steps;
		return {
			translate: `${dx * t}px ${dy * t - 4 * lift * t * (1 - t)}px`,
			scale: String(1 - 0.4 * t),
			opacity: t < 0.86 ? 1 : (1 - t) / 0.14,
		};
	});
	card.style.transformOrigin = "50% 50%";
	await card.animate(frames, { duration: Math.min(760, 420 + distance * 0.3), easing: "linear", fill: "forwards" }).finished;
}

/**
 * The collection takes the catch like a folder a file was dropped into: each quote dips, springs
 * back past its rest and settles, the second a beat after the first and tilting the other way.
 */
export function absorbInto(quotes: Iterable<SVGElement>): void {
	if (reducedMotion()) return;
	let index = 0;
	for (const quote of quotes) {
		const tilt = index === 0 ? -1 : 1;
		quote.animate(
			[
				{ transform: "translateY(0) rotate(0) scale(1, 1)" },
				{ transform: `translateY(5px) rotate(${tilt * 3}deg) scale(1.08, 0.84)`, offset: 0.2, easing: "cubic-bezier(0.3, 0, 0.3, 1)" },
				{ transform: `translateY(-4px) rotate(${-tilt * 4}deg) scale(0.95, 1.07)`, offset: 0.46, easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
				{ transform: `translateY(1px) rotate(${tilt}deg) scale(1.02, 0.98)`, offset: 0.7 },
				{ transform: "translateY(0) rotate(0) scale(1, 1)" },
			],
			{ duration: 640, delay: index * 75, easing: "ease-out" },
		);
		index += 1;
	}
}
