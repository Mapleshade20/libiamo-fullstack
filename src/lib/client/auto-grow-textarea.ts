/** Resize a textarea so its full content is visible without inner scrolling. */
export function autoGrowTextarea(el: HTMLTextAreaElement | null | undefined, minPx = 112) {
	if (!el) return;
	el.style.height = "auto";
	const next = Math.max(minPx, el.scrollHeight);
	el.style.height = `${next}px`;
	el.style.overflowY = "hidden";
}
