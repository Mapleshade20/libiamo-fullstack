<script lang="ts">
import Info from "@lucide/svelte/icons/info";
import { tip } from "./tip";

/* A small ⓘ beside a label: what would otherwise be a line of help under it, shown on hover or keyboard focus. Touch
   has no hover, so a tap toggles the same pill. */
let { text, label }: { text: string; label: string } = $props();
const id = $props.id();
</script>

<span {id} hidden>{text}</span>
<button type="button" class="info" aria-label={label} aria-describedby={id} use:tip={{ text, side: "right", tap: true }}>
	<Info class="size-3.5" aria-hidden="true" />
</button>

<style>
/* Centred between the baseline and the capitals (middle is the lowercase letters' centre, so it rises a tenth of an
   em), and its negative block margins keep the 20px target from making the line taller than its text. */
.info {
	display: inline-grid;
	place-items: center;
	width: 20px;
	height: 20px;
	margin-block: -4px;
	margin-inline-start: 3px;
	vertical-align: middle;
	translate: 0 -0.1em;
	border: 0;
	border-radius: 50%;
	background: none;
	color: var(--muted);
	cursor: help;
	transition: color 150ms;
}
.info:hover {
	color: var(--ink);
}
.info:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
@media (pointer: coarse) {
	.info {
		width: 28px;
		height: 28px;
		margin-block: -8px;
	}
}
</style>
