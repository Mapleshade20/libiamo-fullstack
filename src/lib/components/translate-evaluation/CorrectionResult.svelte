<script lang="ts">
import type { AnimationPlaybackControls } from "motion";
import { onDestroy } from "svelte";
import { fade } from "svelte/transition";
import MarkedText from "$lib/components/learning-feedback/MarkedText.svelte";
import type { MarkedTextPart } from "$lib/marked-text";
import DiffView from "./DiffView.svelte";
import { prefersReducedMotion, revealPanel, stopAll } from "./motion";
import type { DiffPart } from "./types";

interface Props {
	/** Primary diff (accepted path: user changes; second-reject: minimal changes). */
	primaryDiff: DiffPart[] | null;
	primaryLabel: string;
	/** Complete reference answer, presented as plain target-language text. */
	referenceAnswer: string;
	/** Safe semantic-mark parts derived from the model's referenceMarked field. */
	referenceMarked: MarkedTextPart[] | null;
	referenceLabel: string;
	/** Numbered teacher explanations shown with the diffs. */
	teacherNotes?: string[];
	teacherNotesLabel?: string;
	/** When a Diff AST is invalid, fall back to plain text. */
	primaryFallback?: string | null;
}

let {
	primaryDiff,
	primaryLabel,
	referenceAnswer,
	referenceMarked,
	referenceLabel,
	teacherNotes = [],
	teacherNotesLabel = "Teacher's notes",
	primaryFallback = null,
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
			<DiffView parts={primaryDiff} fallbackText={primaryFallback ?? ""} label={primaryLabel} />
		</section>
		<section data-result-panel class="border-l-2 border-[#8fa3b1] bg-card/55 px-4 py-4">
			<h2 class="mb-3 font-sans text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{referenceLabel}</h2>
			<p class="font-prose text-[0.95rem] leading-relaxed break-words text-foreground">
				{#if referenceMarked}
					<MarkedText parts={referenceMarked} onMarkClick={() => undefined} />
				{:else}
					<span class="whitespace-pre-wrap">{referenceAnswer}</span>
				{/if}
			</p>
		</section>
	</div>

	{#if teacherNotes.length > 0}
		<section data-result-panel class="border-y border-stone-400/25 py-4" in:fade={{ duration: 280 }}>
			<p class="mb-4 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{teacherNotesLabel}</p>
			<ol class="space-y-4">
				{#each teacherNotes as note, index (index)}
					<li class="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-3">
						<span
							class="mt-0.5 flex size-7 items-center justify-center rounded-full border border-stone-400/40 bg-card font-sans text-xs font-semibold tabular-nums text-foreground/75 shadow-xs"
							aria-hidden="true"
						>
							{index + 1}
						</span>
						<p class="font-prose text-base leading-relaxed text-foreground/90">{note}</p>
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</div>
