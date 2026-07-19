<script lang="ts">
import type { AnimationPlaybackControls } from "motion";
import { animate } from "motion";
import { onDestroy } from "svelte";
import { findExactHighlightIntervals, segmentHighlightedText } from "$lib/client/translation-highlight";
import { Button } from "$lib/components/ui/button";
import { prefersReducedMotion, revealHighlight, revealPanel, stopAll } from "./motion";
import { type EvaluationData, type Grade, MOTION_TOKENS, RATING_I18N_KEYS, RATING_ORDER } from "./types";

interface Props {
	evaluation: EvaluationData;
	title: string;
	subtitle?: string;
	/** Localized rating labels via key → string map or t() results. */
	ratingLabels: Record<string, string>;
	continueLabel: string;
	regenerateLabel: string;
	yourDraftLabel?: string;
	overallLabel?: string;
	warningTitle: string;
	warningBody: string;
	/** Show regenerate because of unverified cards. */
	showRegenerate?: boolean;
	/** Hide regenerate after Continue gate. */
	overviewConfirmed?: boolean;
	oncontinue?: () => void;
	onregenerate?: () => void;
	/** Animate title shrink + two-column expand on mount. */
	animateEntrance?: boolean;
}

let {
	evaluation,
	title,
	subtitle,
	ratingLabels,
	continueLabel,
	regenerateLabel,
	yourDraftLabel = "Your draft",
	overallLabel = "Overall",
	warningTitle,
	warningBody,
	showRegenerate = false,
	overviewConfirmed = false,
	oncontinue,
	onregenerate,
	animateEntrance = true,
}: Props = $props();

let headingEl: HTMLElement | null = $state(null);
let leftCol: HTMLElement | null = $state(null);
let rightCol: HTMLElement | null = $state(null);
let controls: AnimationPlaybackControls[] = [];

const matchNeedles = $derived(evaluation.cards.filter((c) => c.warnings.length === 0).map((c) => c.originalAnswer));
const intervals = $derived(findExactHighlightIntervals(evaluation.firstDraft, matchNeedles));
const segments = $derived(segmentHighlightedText(evaluation.firstDraft, intervals));
const hasWarnings = $derived(evaluation.cards.some((c) => c.warnings.length > 0) || showRegenerate);

function gradeTone(grade: Grade): string {
	if (grade.startsWith("A")) return "text-emerald-800 bg-emerald-500/12 border-emerald-600/20";
	if (grade.startsWith("B")) return "text-amber-900 bg-amber-500/12 border-amber-700/20";
	if (grade.startsWith("C")) return "text-orange-900 bg-orange-500/12 border-orange-700/20";
	return "text-red-900 bg-red-500/12 border-red-700/20";
}

$effect(() => {
	if (!animateEntrance) return;
	const reduced = prefersReducedMotion();
	stopAll(controls);
	controls = [];

	if (headingEl) {
		if (reduced) {
			controls.push(animate(headingEl, { opacity: [0, 1] }, { duration: 0.2 }));
		} else {
			controls.push(
				animate(
					headingEl,
					{ opacity: [0, 1], y: [18, 0], scale: [1.12, 1] },
					{
						duration: MOTION_TOKENS.durationSlow,
						ease: [...MOTION_TOKENS.easeOut] as [number, number, number, number],
					},
				),
			);
		}
	}
	if (leftCol) controls.push(revealPanel(leftCol, { delay: reduced ? 0 : 0.18, reduced }));
	if (rightCol) controls.push(revealPanel(rightCol, { delay: reduced ? 0 : 0.28, reduced }));

	// highlighter ink
	const marks = leftCol?.querySelectorAll<HTMLElement>("[data-highlight-mark]") ?? [];
	marks.forEach((el, i) => {
		controls.push(revealHighlight(el, { delay: reduced ? 0 : 0.45 + i * 0.12, reduced }));
	});

	return () => stopAll(controls);
});

onDestroy(() => stopAll(controls));
</script>

<section class="mx-auto w-full max-w-3xl" aria-labelledby="eval-overview-title">
	<header class="mb-6 border-b border-border pb-5">
		<p class="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{subtitle ?? ""}</p>
		<h1 id="eval-overview-title" bind:this={headingEl} class="origin-left font-serif text-3xl tracking-tight text-foreground" tabindex="-1">
			{title}
		</h1>
	</header>

	{#if hasWarnings && !overviewConfirmed}
		<div class="mb-6 rounded-xl border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-950" role="status">
			<p class="font-medium">{warningTitle}</p>
			<p class="mt-1 text-amber-900/80">{warningBody}</p>
			{#if showRegenerate || hasWarnings}
				<div class="mt-3"><Button variant="outline" size="sm" onclick={() => onregenerate?.()}>{regenerateLabel}</Button></div>
			{/if}
		</div>
	{/if}

	<div class="@container min-w-0">
		<div class="grid grid-cols-1 gap-6 @min-[40rem]:grid-cols-2 @min-[40rem]:gap-8">
			<!-- Left: immutable first draft (sentence-level highlights only) -->
			<div bind:this={leftCol} class="order-1 min-w-0 space-y-3">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{yourDraftLabel}</p>
				<div class="rounded-2xl border border-border bg-card/70 p-4 shadow-xs sm:p-5">
					<p class="whitespace-pre-wrap break-words font-inter-stack text-[0.95rem] leading-[1.75] text-foreground">
						{#each segments as seg, i (i)}
							{#if seg.kind === "highlight"}
								<mark
									data-highlight-mark
									class="rounded-[0.15em] bg-transparent px-0.5"
									style="background-image: linear-gradient(transparent 12%, color-mix(in oklch, var(--destructive) 22%, transparent) 12%, color-mix(in oklch, var(--destructive) 22%, transparent) 88%, transparent 88%); background-size: 0% 100%; background-repeat: no-repeat;"
									>{seg.text}</mark
								>
							{:else}
								{seg.text}
							{/if}
						{/each}
					</p>
				</div>
			</div>

			<!-- Right: commentary + ratings -->
			<div bind:this={rightCol} class="order-2 min-w-0 space-y-4">
				<p class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{overallLabel}</p>
				<div class="rounded-2xl border border-border bg-card/70 p-4 shadow-xs sm:p-5">
					<p class="text-[0.95rem] leading-relaxed break-words text-foreground/90">{evaluation.overallCommentary}</p>

					<ul class="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
						{#each RATING_ORDER as key (key)}
							{@const grade = evaluation.ratings[key]}
							<li
								class="flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2.5 {gradeTone(grade)} {key === 'overall'
								? 'col-span-2 sm:col-span-1'
								: ''}"
							>
								<span class="text-[0.62rem] font-semibold uppercase tracking-wider opacity-80 leading-tight">
									{ratingLabels[RATING_I18N_KEYS[key]] ?? key}
								</span>
								<span class="font-serif text-xl leading-none">{grade}</span>
							</li>
						{/each}
					</ul>
				</div>

				<div class="flex flex-wrap items-center justify-end gap-3 pt-1"><Button onclick={() => oncontinue?.()}>{continueLabel}</Button></div>
			</div>
		</div>
	</div>
</section>
