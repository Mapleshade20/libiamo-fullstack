<script lang="ts">
import type { AnimationPlaybackControls } from "motion";
import { onDestroy } from "svelte";
import { prefersReducedMotion, revealPanel, stopAll } from "./motion";
import type { DiffPart } from "./types";

interface Props {
	parts: DiffPart[];
	/** Optional label announced before the diff content. */
	label?: string;
	/** Animate parts in on mount. */
	animate?: boolean;
	class?: string;
}

let { parts, label, animate = true, class: className = "" }: Props = $props();

let rootEl: HTMLElement | null = $state(null);
let controls: AnimationPlaybackControls[] = [];

$effect(() => {
	if (!rootEl || !animate) return;
	const reduced = prefersReducedMotion();
	const children = Array.from(rootEl.querySelectorAll<HTMLElement>("[data-diff-part]"));
	stopAll(controls);
	controls = children.map((el, i) => revealPanel(el, { delay: reduced ? 0 : i * 0.04, reduced }));
	return () => stopAll(controls);
});

onDestroy(() => stopAll(controls));
</script>

<div
	class="diff-view font-inter-stack text-[0.95rem] leading-relaxed break-words text-foreground {className}"
	role="group"
	aria-label={label}
	bind:this={rootEl}
>
	{#if label}
		<span class="sr-only">{label}</span>
	{/if}
	{#each parts as part, i (i)}
		{#if part.type === "unchanged"}
			<span data-diff-part class="diff-unchanged">{part.text}</span>
		{:else if part.type === "delete"}
			<span data-diff-part class="diff-delete" aria-label="deleted: {part.text}"> <span class="sr-only">deleted: </span>{part.text} </span>
		{:else if part.type === "add"}
			<span data-diff-part class="diff-add" aria-label="added: {part.text}"> <span class="sr-only">added: </span>{part.text} </span>
		{:else}
			<span data-diff-part class="diff-replace" aria-label="replaced {part.from} with {part.to}">
				<span class="diff-delete"> <span class="sr-only">replaced from: </span>{part.from} </span>
				<span class="diff-add"> <span class="sr-only">replaced with: </span>{part.to} </span>
			</span>
		{/if}
	{/each}
</div>

<style>
.diff-delete {
	color: color-mix(in oklch, var(--destructive) 85%, var(--foreground));
	text-decoration: line-through;
	text-decoration-thickness: 1.5px;
	text-decoration-color: color-mix(in oklch, var(--destructive) 70%, transparent);
	background: color-mix(in oklch, var(--destructive) 10%, transparent);
	border-radius: 0.15em;
	padding: 0 0.1em;
}

.diff-add {
	color: color-mix(in oklch, var(--chart-3) 75%, var(--foreground));
	text-decoration: underline;
	text-decoration-thickness: 1.5px;
	text-underline-offset: 3px;
	background: color-mix(in oklch, var(--chart-3) 12%, transparent);
	border-radius: 0.15em;
	padding: 0 0.15em;
	/* short vertical caps: open box look */
	box-shadow:
		inset 2px 0 0 0 color-mix(in oklch, var(--chart-3) 55%, transparent),
		inset -2px 0 0 0 color-mix(in oklch, var(--chart-3) 55%, transparent);
}

.diff-replace {
	display: inline;
	white-space: normal;
}

.diff-replace .diff-delete {
	margin-right: 0.15em;
}
</style>
