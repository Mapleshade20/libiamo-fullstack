<script lang="ts">
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import { tip } from "#lib/components/common/tip.ts";

/* A password with an eye to show it: one field, no "type it again", since what was typed can be read before sending. */
let {
	value = $bindable(""),
	input = $bindable(null),
	id,
	autocomplete,
	invalid = false,
	describedby,
	show: showLabel,
	hide: hideLabel,
	oninput,
}: {
	value?: string;
	input?: HTMLInputElement | null;
	id: string;
	autocomplete: "current-password" | "new-password";
	invalid?: boolean;
	describedby?: string;
	show: string;
	hide: string;
	oninput?: () => void;
} = $props();
let shown = $state(false);
</script>

<span class="pw">
	<input
		bind:this={input}
		bind:value
		{id}
		class="input"
		type={shown ? "text" : "password"}
		{autocomplete}
		spellcheck="false"
		autocapitalize="off"
		aria-invalid={invalid}
		aria-describedby={describedby}
		{oninput}
	>
	<button
		type="button"
		class="eye"
		aria-label={shown ? hideLabel : showLabel}
		aria-pressed={shown}
		use:tip={shown ? hideLabel : showLabel}
		onclick={() => (shown = !shown)}
	>
		{#if shown}
			<EyeOff class="size-4" aria-hidden="true" />
		{:else}
			<Eye class="size-4" aria-hidden="true" />
		{/if}
	</button>
</span>

<style>
.pw {
	position: relative;
	display: block;
}
.pw :global(.input) {
	padding-inline-end: 44px;
}
.eye {
	position: absolute;
	inset-block: 4px;
	inset-inline-end: 4px;
	display: grid;
	place-items: center;
	width: 32px;
	border: 0;
	border-radius: 5px;
	background: transparent;
	color: var(--muted);
	cursor: pointer;
	transition:
		background-color 150ms,
		color 150ms,
		scale 100ms;
}
.eye:hover {
	color: var(--ink);
	background: color-mix(in srgb, var(--ink) 6%, transparent);
}
.eye:active {
	scale: 0.97;
}
.eye:focus-visible {
	outline: 0;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 50%, transparent);
}
</style>
