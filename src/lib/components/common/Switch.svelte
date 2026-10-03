<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";
import { cn } from "$lib/utils";

/*
 * On/off that applies immediately. A native checkbox with the switch role, so forms and labels keep
 * working; the thumb travels on the spring curve (transitions.dev "Toggle") and the track turns ink.
 */
let { checked = $bindable(false), class: className, ...rest }: Omit<HTMLInputAttributes, "type" | "role"> & { checked?: boolean } = $props();
</script>

<span class={cn("switch relative inline-flex h-5 w-9 shrink-0 align-middle", className)}>
	<input type="checkbox" role="switch" aria-checked={checked} bind:checked {...rest}>
	<span class="thumb" aria-hidden="true"></span>
</span>

<style>
.switch input {
	appearance: none;
	margin: 0;
	width: 100%;
	height: 100%;
	cursor: pointer;
	border-radius: 999px;
	background: color-mix(in oklab, var(--foreground) 16%, transparent);
	transition: background-color 150ms var(--ease-panel);
}
.switch::before {
	content: "";
	position: absolute;
	inset: -12px -4px;
}
.switch input:hover {
	background: color-mix(in oklab, var(--foreground) 22%, transparent);
}
.switch input:checked {
	background: var(--primary);
}
.switch input:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
}
.switch input:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}
.thumb {
	position: absolute;
	top: 2px;
	left: 2px;
	width: 16px;
	height: 16px;
	border-radius: 999px;
	background: #fff;
	box-shadow:
		0 1px 2px rgb(0 0 0 / 0.12),
		0 2px 6px rgb(0 0 0 / 0.06);
	pointer-events: none;
	transition: translate 350ms var(--ease-spring);
}
.switch input:checked + .thumb {
	translate: 16px 0;
}
@media (prefers-reduced-motion: reduce) {
	.switch input,
	.thumb {
		transition: none;
	}
}
</style>
