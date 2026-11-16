<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";
import { cn } from "#lib/utils.ts";

/*
 * On/off that applies immediately. A native checkbox with the switch role, so forms keep working; the thumb travels on the spring curve (transitions.dev "Toggle") and the track turns ink.
 */
let {
	checked = $bindable(false),
	class: className,
	"aria-label": name,
	...rest
}: Omit<HTMLInputAttributes, "type" | "role"> & { checked?: boolean } = $props();
</script>

<!-- A label, so its wider hit area (::before, over the input) presses the switch too; its hidden text names the input. -->
<label class={cn("switch relative inline-flex h-5 w-9 shrink-0 align-middle", className)}>
	<input type="checkbox" role="switch" aria-checked={checked} bind:checked {...rest}>
	<span class="thumb" aria-hidden="true"></span>
	<span class="sr-only">{name}</span>
</label>

<style>
/* A paper slider in a recess of the desk; on, the recess is inked blue. */
.switch input {
	appearance: none;
	margin: 0;
	width: 100%;
	height: 100%;
	cursor: pointer;
	border-radius: 6px;
	background: var(--groove);
	box-shadow: var(--groove-shadow);
	transition: background-color 150ms var(--ease-panel);
}
.switch::before {
	content: "";
	position: absolute;
	inset: -12px -4px;
}
.switch input:hover {
	filter: brightness(0.97);
}
.switch input:checked {
	background: linear-gradient(color-mix(in srgb, var(--switch-on, #3a5a8a) 82%, #000), var(--switch-on, #3a5a8a));
}
:global([data-theme="dark"]) .switch input:checked {
	--switch-on: #5b7fb3;
}
.switch input:focus-visible {
	outline: none;
	box-shadow:
		var(--groove-shadow),
		0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent);
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
	border-radius: 4px;
	background: var(--raised-face);
	box-shadow: var(--raised-shadow);
	pointer-events: none;
	transition: translate 350ms var(--ease-spring);
}
:global([data-theme="dark"]) .thumb {
	background: linear-gradient(#f2f2f2, #d2d2d2);
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
