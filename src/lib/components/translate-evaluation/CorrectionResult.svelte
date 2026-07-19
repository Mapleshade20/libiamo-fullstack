<script lang="ts">
import type { AnimationPlaybackControls } from "motion";
import { onDestroy } from "svelte";
import { fade } from "svelte/transition";
import DiffView from "./DiffView.svelte";
import { prefersReducedMotion, revealPanel, stopAll } from "./motion";
import type { DiffPart } from "./types";

interface Props {
	/** Primary diff (accepted path: user changes; second-reject: minimal changes). */
	primaryDiff: DiffPart[];
	primaryLabel: string;
	/** Secondary diff (always reference changes when available). */
	referenceDiff: DiffPart[];
	referenceLabel: string;
	/** Teacher explanation shown with the diffs. */
	teachersNote?: string | null;
	teachersNoteLabel?: string;
	/** When a Diff AST is invalid, fall back to plain text. */
	primaryFallback?: string | null;
	referenceFallback?: string | null;
}

let {
	primaryDiff,
	primaryLabel,
	referenceDiff,
	referenceLabel,
	teachersNote = null,
	teachersNoteLabel = "Teacher's note",
	primaryFallback = null,
	referenceFallback = null,
}: Props = $props();

let root: HTMLElement | null = $state(null);
let controls: AnimationPlaybackControls[] = [];

$effect(() => {
	if (!root) return;
	const reduced = prefersReducedMotion();
	const panels = Array.from(root.querySelectorAll<HTMLElement>("[data-result-panel]"));
	stopAll(controls);
	controls = panels.map((el, i) => revealPanel(el, { delay: reduced ? 0 : i * 0.1, reduced }));
	return () => stopAll(controls);
});

onDestroy(() => stopAll(controls));
</script>

<div bind:this={root} class="space-y-5">
	<div class="grid gap-4 md:grid-cols-2">
		<section data-result-panel class="border-l-2 border-[#8fa3b1] bg-card/55 px-4 py-4">
			<h2 class="mb-3 font-sans text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{primaryLabel}</h2>
			{#if primaryFallback}
				<p class="break-words text-base leading-relaxed text-foreground/90">{primaryFallback}</p>
			{:else}
				<DiffView parts={primaryDiff} label={primaryLabel} />
			{/if}
		</section>
		<section data-result-panel class="border-l-2 border-[#8faf8f] bg-card/55 px-4 py-4">
			<h2 class="mb-3 font-sans text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{referenceLabel}</h2>
			{#if referenceFallback}
				<p class="break-words text-base leading-relaxed text-foreground/90">{referenceFallback}</p>
			{:else}
				<DiffView parts={referenceDiff} label={referenceLabel} />
			{/if}
		</section>
	</div>

	{#if teachersNote}
		<section data-result-panel class="border-y border-stone-400/25 py-4" in:fade={{ duration: 280 }}>
			<p class="mb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{teachersNoteLabel}</p>
			<p class="text-base leading-relaxed text-foreground/90">{teachersNote}</p>
		</section>
	{/if}
</div>
