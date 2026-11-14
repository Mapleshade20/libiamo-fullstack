<script lang="ts">
import X from "@lucide/svelte/icons/x";
import type { Snippet } from "svelte";
import { tip } from "$lib/components/common/tip";

/*
 * The top of every focused page, one standard for all of them (review, collect, a scenario's way in and out, the
 * session): the wordmark (home) at the start, the page's own progress in the middle, and the way out, an ✕ named by
 * its tip, always last. Leaving a focused page never loses anything, so the ✕ never asks.
 */
let { children, exit }: { children?: Snippet; exit?: { label: string; href?: string; onclick?: () => void } } = $props();
</script>

<header class="focus-bar">
	<a class="wordmark" href="/">Libiamo</a>
	<div class="mid">{@render children?.()}</div>
	{#if exit}
		{#if exit.href}
			<a class="exit" href={exit.href} onclick={exit.onclick} use:tip={exit.label}
				><X class="size-[18px]" aria-hidden="true" /><span class="sr-only">{exit.label}</span></a
			>
		{:else}
			<button type="button" class="exit" onclick={exit.onclick} use:tip={exit.label}><X class="size-[18px]" aria-hidden="true" /></button>
		{/if}
	{/if}
</header>

<style>
.focus-bar {
	position: relative;
	z-index: 3;
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 54px;
	padding: 14px max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left));
}
.wordmark {
	font-size: 32px;
}
/* On a phone the wordmark stays where it is between a focused page and the app's top bar; on a wide screen it leaves
   with the sidebar instead. */
@media (max-width: 899px) {
	.wordmark {
		view-transition-name: brand;
	}
}
.mid {
	flex: 1;
	padding-inline: 16px;
	display: flex;
	justify-content: center;
	min-width: 0;
}
.exit {
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	flex: none;
	border-radius: 6px;
	color: var(--muted);
	transition:
		color 150ms,
		background-color 150ms,
		scale 150ms;
}
.exit:hover {
	color: var(--ink);
	background: var(--hover);
}
.exit:active {
	scale: 0.97;
}
.exit:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
@media (pointer: coarse) {
	.exit {
		width: 44px;
		height: 44px;
	}
}
</style>
