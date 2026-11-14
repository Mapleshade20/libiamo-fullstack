<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import CheckCheck from "@lucide/svelte/icons/check-check";
import X from "@lucide/svelte/icons/x";
import type { Rating } from "$lib/review/session";

/*
 * A rating as a teacher marks the margin: ✕ again, ~ hard, ✓ good, ✓✓ easy, each in its rating's colour. The shape
 * carries the meaning on its own (colour alone: good's green and easy's blue were hard to tell apart at this size, and
 * no use to a colour-blind learner).
 */
let { rating, size = 15 }: { rating: Rating; size?: number } = $props();
const TONE: Record<Rating, string> = { again: "--bad", hard: "--warn", good: "--ok", easy: "--cool" };
</script>

<span class="mark" style:--tone="var({TONE[rating]})" style:--s="{size}px" aria-hidden="true">
	{#if rating === "again"}
		<X {size} strokeWidth={2.6} />
	{:else if rating === "hard"}
		<svg
			aria-hidden="true"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.6"
			stroke-linecap="round"
		>
			<path d="M4 14.5c2.5-4.5 5.5-4.5 8 0s5.5 4.5 8 0" />
		</svg>
	{:else if rating === "good"}
		<Check {size} strokeWidth={2.6} />
	{:else}
		<CheckCheck {size} strokeWidth={2.6} />
	{/if}
</span>

<style>
.mark {
	display: inline-grid;
	place-items: center;
	width: var(--s);
	height: var(--s);
	color: var(--tone);
}
</style>
