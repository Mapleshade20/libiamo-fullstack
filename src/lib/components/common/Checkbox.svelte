<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";

/*
 * The app's checkbox (/lab/controls, "ink square"): a native checkbox drawn as a square that inks when checked, its tick
 * drawn in. The label around it is the caller's; the focus ring goes on the box.
 */
let { checked = $bindable(false), class: className = "", ...rest }: Omit<HTMLInputAttributes, "type"> & { checked?: boolean } = $props();
</script>

<span class="cbox {className}">
	<input type="checkbox" bind:checked {...rest}>
	<svg viewBox="0 0 20 20" aria-hidden="true"><path pathLength="1" d="M5 10.4l3.2 3.2L15 6.4" /></svg>
</span>

<style>
.cbox {
	position: relative;
	display: inline-grid;
	flex: none;
	place-items: center;
	width: 18px;
	height: 18px;
}
.cbox > * {
	grid-area: 1 / 1;
}
input {
	appearance: none;
	margin: 0;
	width: 18px;
	height: 18px;
	border-radius: 4px;
	cursor: pointer;
	box-shadow: inset 0 0 0 1.25px color-mix(in oklab, var(--ink) 40%, transparent);
	transition:
		background-color 150ms var(--ease-panel),
		box-shadow 150ms var(--ease-panel);
}
input:hover,
:global(label:hover) > .cbox input {
	box-shadow: inset 0 0 0 1.25px color-mix(in oklab, var(--ink) 65%, transparent);
}
input:checked {
	background: var(--ink);
	box-shadow: none;
}
input:disabled {
	cursor: default;
	opacity: 0.5;
}
input:focus-visible {
	outline: 3px solid color-mix(in oklab, var(--ring-c) 70%, transparent);
	outline-offset: 2px;
}
svg {
	width: 20px;
	height: 20px;
	overflow: visible;
	pointer-events: none;
}
path {
	fill: none;
	stroke: var(--bg);
	stroke-width: 2;
	stroke-linecap: round;
	stroke-linejoin: round;
	stroke-dasharray: 1;
	stroke-dashoffset: 1;
	transition: stroke-dashoffset 150ms ease-in;
}
input:checked + svg path {
	stroke-dashoffset: 0;
	transition: stroke-dashoffset 350ms var(--ease-panel);
}
@media (prefers-reduced-motion: reduce) {
	path,
	input:checked + svg path {
		transition: none;
	}
}
</style>
