<script lang="ts">
import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef, type WithoutChildren } from "$lib/utils.js";

let { ref = $bindable(null), class: className, ...restProps }: WithoutChildren<WithElementRef<HTMLAttributes<HTMLDivElement>>> = $props();
</script>

<div bind:this={ref} data-slot="skeleton" aria-hidden="true" class={cn("bg-muted rounded-md skeleton-pulse", className)} {...restProps}></div>

<style>
.skeleton-pulse {
	animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
	50% {
		opacity: 0.5;
	}
}
@media (prefers-reduced-motion: reduce) {
	.skeleton-pulse {
		animation: none;
	}
}
</style>
