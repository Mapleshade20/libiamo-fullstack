<script lang="ts">
import { Portal } from "bits-ui";
import { onDestroy, untrack } from "svelte";

/*
 * A brief note that grows out of the side of whatever was just pressed, for a choice that is shown
 * but cannot be made yet. Call `show()` from the press handler; the note leaves on its own.
 */
let tip = $state<{ text: string; anchor: DOMRect; top: number; left: number; side: "left" | "right" | "bottom"; key: number } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let shown = 0;

export function show(anchor: Element, text: string): void {
	const rect = anchor.getBoundingClientRect();
	tip = { text, anchor: rect, top: 0, left: 0, side: "right", key: ++shown };
	clearTimeout(timer);
	timer = setTimeout(() => (tip = null), 2200);
}

function place(node: HTMLElement): void {
	const current = untrack(() => tip);
	if (!current) return;
	const { anchor } = current;
	const width = node.offsetWidth;
	const height = node.offsetHeight;
	const margin = 12;
	const gap = 8;
	const side = anchor.right + gap + width <= window.innerWidth - margin ? "right" : anchor.left - gap - width >= margin ? "left" : "bottom";
	const left = side === "right" ? anchor.right + gap : side === "left" ? anchor.left - gap - width : anchor.left + (anchor.width - width) / 2;
	const top = side === "bottom" ? anchor.bottom + gap : anchor.top + (anchor.height - height) / 2;
	tip = {
		...current,
		side,
		left: Math.max(margin, Math.min(left, window.innerWidth - margin - width)),
		top: Math.max(margin, Math.min(top, window.innerHeight - margin - height)),
	};
}

onDestroy(() => clearTimeout(timer));
</script>

<Portal>
	<span class="sr-only" role="status">{tip?.text ?? ""}</span>
	{#if tip}
		{#key tip.key}
			<span
				{@attach place}
				class="side-tip info-tip pointer-events-none fixed z-[80] w-max max-w-[min(16rem,calc(100vw-1.5rem))] rounded-lg bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground"
				data-side={tip.side}
				style:top="{tip.top}px"
				style:left="{tip.left}px"
				aria-hidden="true"
				>{tip.text}</span
			>
		{/key}
	{/if}
</Portal>

<style>
/* Coordinates use the measured size; the shared keyframes only animate the entrance. */
.side-tip {
	animation: info-tip-in 250ms cubic-bezier(0.22, 1, 0.36, 1);
	transform-origin: left center;
}
.side-tip[data-side="left"] {
	transform-origin: right center;
}
.side-tip[data-side="bottom"] {
	transform-origin: top center;
}
@media (prefers-reduced-motion: reduce) {
	.side-tip {
		animation: none;
	}
}
</style>
