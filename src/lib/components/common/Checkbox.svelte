<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";
import { cn } from "$lib/utils";

/*
 * A native checkbox drawn in ink (transitions.dev "Checkbox check"): the box fills, then the tick
 * draws along its stroke. Being a real input keeps forms, `form=`, labels and indeterminate working.
 */
let {
	checked = $bindable(false),
	indeterminate = $bindable(false),
	class: className,
	...rest
}: Omit<HTMLInputAttributes, "type"> & { checked?: boolean; indeterminate?: boolean } = $props();
</script>

<span class={cn("checkbox relative inline-flex size-[18px] shrink-0 align-middle", className)}>
	<input type="checkbox" bind:checked bind:indeterminate {...rest}>
	<svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
		{#if indeterminate}
			<path class="dash" d="M5 9H13" />
		{:else}
			<path class="tick" d="M4.75 9.25L7.5 12L13.25 6.25" />
		{/if}
	</svg>
</span>

<style>
.checkbox input {
	appearance: none;
	margin: 0;
	width: 100%;
	height: 100%;
	cursor: pointer;
	border-radius: 5px;
	background: rgb(255 255 255 / 0.8);
	box-shadow: inset 0 0 0 1px var(--input);
	transition:
		background-color 150ms var(--ease-panel),
		box-shadow 150ms var(--ease-panel);
}
/* Reach a 44px target without growing the box. */
.checkbox::before {
	content: "";
	position: absolute;
	inset: -13px;
}
.checkbox input:hover {
	box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--foreground) 35%, transparent);
}
.checkbox input:checked,
.checkbox input:indeterminate {
	background: var(--primary);
	box-shadow: inset 0 0 0 1px var(--primary);
}
.checkbox input:focus-visible {
	outline: none;
	box-shadow:
		inset 0 0 0 1px var(--ring),
		0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
}
.checkbox input:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}
.checkbox svg {
	position: absolute;
	inset: 0;
	pointer-events: none;
	overflow: visible;
}
.checkbox path {
	stroke: var(--primary-foreground);
	stroke-width: 1.75;
	stroke-linecap: round;
	stroke-linejoin: round;
	stroke-dasharray: 15;
	stroke-dashoffset: 15;
	transition: stroke-dashoffset 150ms var(--ease-panel);
}
.checkbox input:checked + svg .tick,
.checkbox input:indeterminate + svg .dash {
	stroke-dashoffset: 0;
	transition: stroke-dashoffset 350ms var(--ease-panel);
}
@media (prefers-reduced-motion: reduce) {
	.checkbox input,
	.checkbox path,
	.checkbox input:checked + svg .tick,
	.checkbox input:indeterminate + svg .dash {
		transition: none;
	}
}
</style>
