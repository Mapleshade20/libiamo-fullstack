<script lang="ts">
import type { AnimationPlaybackControls } from "motion";
import { animate } from "motion";
import { onDestroy } from "svelte";
import {
	findExactOverviewHighlightIntervals,
	getOverviewHighlightNeedles,
	segmentOverviewHighlightedText,
} from "$lib/components/translation/evaluation/highlight";
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
	oncontinue,
	onregenerate,
	animateEntrance = true,
}: Props = $props();

let headingEl: HTMLElement | null = $state(null);
let leftCol: HTMLElement | null = $state(null);
let rightCol: HTMLElement | null = $state(null);
let controls: AnimationPlaybackControls[] = [];

const highlightNeedles = $derived(getOverviewHighlightNeedles(evaluation.cards));
const intervals = $derived(findExactOverviewHighlightIntervals(evaluation.firstDraft, highlightNeedles));
const segments = $derived(segmentOverviewHighlightedText(evaluation.firstDraft, intervals));
const hasWarnings = $derived(evaluation.cards.some((c) => c.warnings.length > 0) || showRegenerate);

function gradeTone(grade: Grade): string {
	if (grade.startsWith("A")) return "text-success bg-success/12 border-success/20";
	if (grade.startsWith("B")) return "text-warning bg-warning/12 border-warning/20";
	if (grade.startsWith("C")) return "text-orange-900 bg-orange-500/12 border-orange-700/20";
	return "text-destructive bg-destructive/10 border-destructive/20";
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
		<p class="mb-2 text-xs font-medium text-muted-foreground">{subtitle ?? ""}</p>
		<h1 id="eval-overview-title" bind:this={headingEl} class="origin-left" tabindex="-1">{title}</h1>
	</header>

	{#if hasWarnings}
		<div class="mb-6 rounded-xl border border-warning/30 bg-warning/[0.08] px-4 py-3 text-sm text-foreground" role="status">
			<p class="font-medium">{warningTitle}</p>
			<p class="mt-1 text-foreground/80">{warningBody}</p>
			{#if showRegenerate || hasWarnings}
				<div class="mt-3"><Button variant="secondary" size="sm" onclick={() => onregenerate?.()}>{regenerateLabel}</Button></div>
			{/if}
		</div>
	{/if}

	<div class="@container min-w-0">
		<div class="grid grid-cols-1 gap-6 @min-[40rem]:grid-cols-2 @min-[40rem]:gap-8">
			<!-- Left: immutable first draft (sentence-level highlights only) -->
			<div bind:this={leftCol} class="order-1 min-w-0 space-y-3">
				<p class="text-xs font-medium text-muted-foreground">{yourDraftLabel}</p>
				<div class="rounded-2xl border border-border bg-card/70 p-4 shadow-xs sm:p-5">
					<p class="whitespace-pre-wrap break-words font-prose text-base leading-[1.75] text-foreground">
						{#each segments as seg, i (i)}
							{#if seg.kind === "highlight"}
								<mark data-highlight-mark data-highlight-tone={seg.tone} class="overview-highlight overview-highlight--{seg.tone}">{seg.text}</mark>
							{:else}
								{seg.text}
							{/if}
						{/each}
					</p>
				</div>
			</div>

			<!-- Right: commentary + ratings -->
			<div bind:this={rightCol} class="order-2 min-w-0 space-y-4">
				<p class="text-xs font-medium text-muted-foreground">{overallLabel}</p>
				<div class="rounded-2xl border border-border bg-card/70 p-4 shadow-xs sm:p-5">
					<p class="font-prose text-base leading-relaxed break-words text-foreground/90">{evaluation.overallCommentary}</p>

					<ul class="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
						{#each RATING_ORDER as key (key)}
							{@const grade = evaluation.ratings[key]}
							<li class="flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2.5 {gradeTone(grade)}">
								<span class="text-xs font-medium opacity-80 leading-tight"> {ratingLabels[RATING_I18N_KEYS[key]] ?? key} </span>
								<span class="text-xl font-semibold leading-none">{grade}</span>
							</li>
						{/each}
					</ul>
				</div>

				<div class="flex flex-wrap items-center justify-end gap-3 pt-1"><Button onclick={() => oncontinue?.()}>{continueLabel}</Button></div>
			</div>
		</div>
	</div>
</section>

<style>
.overview-highlight {
	-webkit-box-decoration-break: clone;
	box-decoration-break: clone;
	margin-inline: 0.04em;
	border-radius: 0.2em;
	padding: 0.12em 0.22em;
	color: inherit;
	background-color: transparent;
	background-image: linear-gradient(var(--overview-highlight-color), var(--overview-highlight-color));
	background-position: left center;
	background-size: 0% 100%;
	background-repeat: no-repeat;
}

.overview-highlight--issue {
	--overview-highlight-color: color-mix(in oklch, var(--destructive) 12%, transparent);
}

.overview-highlight--warning {
	--overview-highlight-color: color-mix(in oklch, #d6a514 24%, transparent);
}
</style>
