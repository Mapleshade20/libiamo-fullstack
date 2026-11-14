/* Small motion helpers shared by the pages (transitions.dev recipes). Each does nothing under reduced motion. */
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A refusal: the element shakes ("Error state shake"), again on every repeat. */
export function shake(el: Element | null | undefined) {
	if (!el || reducedMotion()) return;
	el.animate(
		[
			{ transform: "none" },
			{ transform: "translateX(-6px)" },
			{ transform: "translateX(5px)" },
			{ transform: "translateX(-3px)" },
			{ transform: "translateX(2px)" },
			{ transform: "none" },
		],
		{ duration: 380, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
	);
}

/** Grows a textarea to fit what is in it. */
export function autogrow(node: HTMLTextAreaElement, _value?: unknown) {
	const grow = () => {
		node.style.height = "auto";
		node.style.height = `${node.scrollHeight}px`;
	};
	grow();
	node.addEventListener("input", grow);
	const ro = new ResizeObserver(() => grow());
	ro.observe(node.parentElement ?? node);
	return {
		update: grow,
		destroy() {
			node.removeEventListener("input", grow);
			ro.disconnect();
		},
	};
}
