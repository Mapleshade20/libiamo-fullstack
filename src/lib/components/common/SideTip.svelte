<script lang="ts">
import { Portal } from "bits-ui";
import { onDestroy } from "svelte";

/*
 * A brief note that grows out of the side of whatever was just pressed, for a choice that is shown
 * but cannot be made yet. Call `show()` from the press handler; the note leaves on its own.
 */
let tip = $state<{ text: string; top: number; left: number; side: "left" | "right"; key: number } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let shown = 0;

export function show(anchor: Element, text: string): void {
	const rect = anchor.getBoundingClientRect();
	const side = rect.right + 220 <= window.innerWidth ? "right" : "left";
	tip = { text, top: rect.top + rect.height / 2, left: side === "right" ? rect.right + 8 : rect.left - 8, side, key: ++shown };
	clearTimeout(timer);
	timer = setTimeout(() => (tip = null), 2200);
}

onDestroy(() => clearTimeout(timer));
</script>

<Portal>
	<span class="sr-only" role="status">{tip?.text ?? ""}</span>
	{#if tip}
		{#key tip.key}
			<span
				class="side-tip info-tip pointer-events-none fixed z-[80] w-max max-w-64 rounded-lg bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground"
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
/* `translate` places it; the shared `info-tip-in` keyframes own `transform`. */
.side-tip {
	translate: 0 -50%;
	animation: info-tip-in 250ms cubic-bezier(0.22, 1, 0.36, 1);
	transform-origin: left center;
}
.side-tip[data-side="left"] {
	translate: -100% -50%;
	transform-origin: right center;
}
@media (prefers-reduced-motion: reduce) {
	.side-tip {
		animation: none;
	}
}
</style>
