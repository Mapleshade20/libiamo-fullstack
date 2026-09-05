<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import { fade } from "svelte/transition";
import { autoGrowTextarea } from "$lib/client/auto-grow-textarea";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";
import { renderMarkdown } from "$lib/markdown";
import CorrectionResult from "./CorrectionResult.svelte";
import { prefersReducedMotion } from "./motion";
import type { CorrectionCardData, LocalCardState } from "./types";

interface Props {
	card: CorrectionCardData;
	local: LocalCardState;
	cardIndex: number;
	cardTotal: number;
	titleLabel?: string;
	eyebrowLabel?: string;
	sourceLabel: string;
	originalLabel: string;
	hintLabel: string;
	deeperHintLabel?: string;
	showDeeperHintLabel?: string;
	showInitialHintLabel?: string;
	reviseLabel?: string;
	inputPlaceholder: string;
	/** Used as aria-label for the icon submit control. */
	continueLabel: string;
	retryLabel: string;
	providerErrorTitle: string;
	providerErrorBody: string;
	nextAriaLabel: string;
	yourDiffLabel: string;
	minimalDiffLabel: string;
	referenceLabel: string;
	feedbackLabel: string;
	teacherNotesLabel?: string;
	/** Dev review mode: show generated hint/result UI without accepting correction input. */
	reviewOnly?: boolean;
	submitting?: boolean;
	onsubmit?: (input: string) => void;
	onretry?: () => void;
	onnext?: () => void;
	oninput?: (value: string) => void;
}

let {
	card,
	local,
	cardIndex,
	cardTotal,
	titleLabel = "Correction",
	eyebrowLabel = "Stage 1",
	sourceLabel,
	originalLabel,
	hintLabel,
	deeperHintLabel = "Deeper hint",
	showDeeperHintLabel = "Show deeper hint",
	showInitialHintLabel = "Show initial hint",
	reviseLabel = "Your revision",
	inputPlaceholder,
	continueLabel,
	retryLabel,
	providerErrorTitle,
	providerErrorBody,
	nextAriaLabel,
	yourDiffLabel,
	minimalDiffLabel,
	referenceLabel,
	feedbackLabel,
	teacherNotesLabel = "Teacher's notes",
	reviewOnly = false,
	submitting = false,
	onsubmit,
	onretry,
	onnext,
	oninput,
}: Props = $props();

const isResult = $derived(local.phase === "accepted" || local.phase === "second_reject");
const isAccepted = $derived(local.phase === "accepted");
const isSecondReject = $derived(local.phase === "second_reject");
const isProviderError = $derived(local.phase === "provider_error");
const showInput = $derived(local.phase === "initial" || local.phase === "first_reject" || local.phase === "provider_error");
const isFirstReject = $derived(local.phase === "first_reject");
const showFeedback = $derived(Boolean(local.feedback && isFirstReject));
const wantDeeperHint = $derived(isFirstReject || local.attemptCount >= 1);
const canSubmit = $derived(showInput && local.input.trim().length > 0 && !submitting);
const initialHintHtml = $derived(renderMarkdown(card.initialHint));
const deeperHintHtml = $derived(renderMarkdown(card.deeperHint));

let inputEl: HTMLTextAreaElement | null = $state(null);
let hintRailEl: HTMLDivElement | null = $state(null);

/**
 * Feedback layout push + wipe-down enter.
 * Horizontal hint swap only after the push settles (green box no longer moving).
 */
let feedbackSlotOpen = $state(false);
let hintShowDeeper = $state(false);
/** Keep error banner mounted while collapsing so exit anim can finish. */
let providerBannerVisible = $state(false);
let providerBannerOpen = $state(false);

/** Expand/wipe duration — hint slides only after this. */
const FEEDBACK_PUSH_MS = 560;
/** Horizontal rail slide duration. */
const HINT_SLIDE_MS = 620;
const PROVIDER_SLOT_MS = 420;

$effect(() => {
	cardIndex;
	if (reviewOnly) hintShowDeeper = false;
});

$effect(() => {
	if (!showInput) return;
	local.input;
	autoGrowTextarea(inputEl, 112);
});

$effect(() => {
	const reduced = prefersReducedMotion();

	if (!showFeedback) {
		feedbackSlotOpen = false;
		// No feedback row: keep shallow unless already mid deeper-hint flow without feedback UI.
		hintShowDeeper = wantDeeperHint && !isFirstReject;
		return;
	}

	// First reject with feedback: start shallow, push open, then slide deeper.
	feedbackSlotOpen = false;
	hintShowDeeper = false;

	const openDelay = reduced ? 0 : 16;
	const afterPush = reduced ? 30 : FEEDBACK_PUSH_MS;

	const openId = window.setTimeout(() => {
		feedbackSlotOpen = true;
	}, openDelay);

	const slideId = window.setTimeout(() => {
		if (wantDeeperHint) hintShowDeeper = true;
	}, openDelay + afterPush);

	return () => {
		window.clearTimeout(openId);
		window.clearTimeout(slideId);
	};
});

/** Provider error banner: open with expand; close with collapse (never hard-cut). */
$effect(() => {
	const reduced = prefersReducedMotion();
	if (isProviderError) {
		providerBannerVisible = true;
		providerBannerOpen = false;
		const openId = window.setTimeout(
			() => {
				providerBannerOpen = true;
			},
			reduced ? 0 : 16,
		);
		return () => window.clearTimeout(openId);
	}
	if (!providerBannerVisible) return;
	providerBannerOpen = false;
	const hideId = window.setTimeout(
		() => {
			providerBannerVisible = false;
		},
		reduced ? 0 : PROVIDER_SLOT_MS,
	);
	return () => window.clearTimeout(hideId);
});

/** Fit rail height to the visible panel (avoids white strip under shorter deeper copy). */
$effect(() => {
	if (!hintRailEl) return;
	const reduced = prefersReducedMotion();
	const panels = hintRailEl.querySelectorAll<HTMLElement>(".hint-panel");
	if (panels.length < 2) return;

	const shallowH = panels[0].offsetHeight;
	const deeperH = panels[1].offsetHeight;
	const targetH = hintShowDeeper ? deeperH : shallowH;

	if (hintShowDeeper && deeperH > shallowH && !reduced) {
		// Grow first so taller deeper content is not clipped mid-slide.
		hintRailEl.style.height = `${deeperH}px`;
		return;
	}

	const delay = hintShowDeeper && !reduced ? HINT_SLIDE_MS + 40 : 0;
	const id = window.setTimeout(() => {
		if (!hintRailEl) return;
		hintRailEl.style.height = `${targetH}px`;
	}, delay);
	return () => window.clearTimeout(id);
});

function handleSubmit() {
	if (!canSubmit) return;
	onsubmit?.(local.input);
}

/** Retry = same path as the up-arrow submit (re-send current draft). */
function handleRetry() {
	if (submitting) return;
	const draft = local.input.trim();
	if (!draft) {
		onretry?.();
		return;
	}
	onsubmit?.(local.input);
}
</script>

<section class="mx-auto w-full max-w-3xl" aria-labelledby="correction-card-title">
	<header class="mb-6 flex items-end justify-between gap-3 border-b border-stone-400/25 pb-5">
		<div class="min-w-0">
			<p class="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">{eyebrowLabel}</p>
			<h1 id="correction-card-title" class="font-serif text-3xl leading-tight tracking-tight focus:outline-none" tabindex="-1">{titleLabel}</h1>
		</div>
		<p class="shrink-0 font-serif text-lg tabular-nums">
			<span class="text-2xl">{cardIndex + 1}</span><span class="mx-1 text-muted-foreground">/</span>{cardTotal}
		</p>
	</header>

	<div class="grid gap-4 sm:grid-cols-[4.75rem_minmax(0,1fr)] sm:gap-5">
		<p class="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{sourceLabel}</p>
		<p class="font-prose text-lg leading-relaxed break-words">{card.sourceText}</p>

		<p class="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{originalLabel}</p>
		<blockquote class="border-l-2 border-[#c9a4a4] pl-4 font-prose text-base leading-relaxed break-words text-foreground/75">
			{card.originalAnswer}
		</blockquote>
	</div>

	{#if isAccepted}
		<div class="mt-9" in:fade={{ duration: 280 }}>
			<CorrectionResult
				primaryDiff={local.acceptedDiff}
				primaryLabel={yourDiffLabel}
				primaryFallback={local.acceptedDiff ? null : local.acceptedAnswer}
				referenceAnswer={card.referenceAnswer}
				referenceMarked={card.referenceMarked}
				{referenceLabel}
				teacherNotes={card.teacherNotes}
				{teacherNotesLabel}
			/>
		</div>
	{:else if isSecondReject}
		<div class="mt-9 space-y-6" in:fade={{ duration: 280 }}>
			{#if local.feedback}
				<div class="flex gap-3 border-l-2 border-[#c9a4a4] bg-red-50/45 px-4 py-3" role="status">
					<AlertCircle class="mt-0.5 size-4 shrink-0 text-red-700" />
					<div>
						<p class="mb-1 text-[10px] font-semibold tracking-[0.14em] text-red-800 uppercase">{feedbackLabel}</p>
						<p class="font-prose text-sm leading-relaxed text-red-950">{local.feedback}</p>
					</div>
				</div>
			{/if}
			<CorrectionResult
				primaryDiff={card.minimalDiff}
				primaryLabel={minimalDiffLabel}
				referenceAnswer={card.referenceAnswer}
				referenceMarked={card.referenceMarked}
				{referenceLabel}
				teacherNotes={card.teacherNotes}
				{teacherNotesLabel}
				primaryFallback={card.warnings.includes("minimal_diff_invalid") ? card.minimalAnswer : null}
			/>
		</div>
	{:else}
		<div class="mt-7 border-t border-stone-400/25 pt-6">
			{#if !reviewOnly}
				<label for="correction-input" class="mb-3 block text-sm font-semibold">{reviseLabel}</label>

				<div class="flex items-center gap-2.5">
					<Textarea
						id="correction-input"
						bind:ref={inputEl}
						rows={4}
						value={local.input}
						readonly={submitting}
						placeholder={inputPlaceholder}
						class="min-h-28 flex-1 resize-none overflow-hidden rounded-md bg-card/75 text-base leading-relaxed shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
						oninput={(e) => {
							if (submitting) return;
							const el = e.currentTarget;
							oninput?.(el.value);
							autoGrowTextarea(el, 112);
						}}
						onkeydown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								handleSubmit();
							}
						}}
					/>
					<button
						type="button"
						class="submit-orbit relative size-11 shrink-0 rounded-full transition-[opacity,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40
						{canSubmit || submitting ? 'opacity-100' : 'opacity-40'}
						{submitting ? 'submit-orbit--busy scale-[1.02]' : 'hover:scale-[1.03] active:scale-[0.97]'}"
						disabled={!canSubmit && !submitting}
						aria-label={continueLabel}
						aria-busy={submitting}
						onclick={handleSubmit}
					>
						<span class="submit-orbit__ring" aria-hidden="true"></span>
						<span
							class="relative z-[1] flex size-full items-center justify-center rounded-full border border-transparent bg-primary text-primary-foreground shadow-sm transition-colors duration-300
							{submitting ? 'bg-primary/90' : ''}"
						>
							<ArrowUp
								class="size-5 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] {submitting
								? '-translate-y-0.5 opacity-90'
								: ''}"
								strokeWidth={2.25}
							/>
						</span>
					</button>
				</div>

				{#if providerBannerVisible}
					<div class="provider-slot mt-4" class:provider-slot--open={providerBannerOpen}>
						<div class="provider-slot__inner">
							<div
								class="mb-0 flex flex-col gap-3 border-l-2 border-amber-600 bg-amber-50/55 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
								role="alert"
							>
								<div class="flex gap-3">
									<AlertCircle class="mt-0.5 size-4 shrink-0 text-amber-800" />
									<div>
										<p class="text-sm font-medium text-amber-950">{providerErrorTitle}</p>
										<p class="mt-0.5 text-sm leading-relaxed text-amber-950/85">{providerErrorBody}</p>
									</div>
								</div>
								<Button size="sm" variant="outline" class="bg-transparent" disabled={submitting} onclick={handleRetry}>
									<RotateCcw />{retryLabel}
								</Button>
							</div>
						</div>
					</div>
				{/if}
			{/if}

			<!--
				Sequence:
				1) Feedback slot expands → green hint box is pushed down (same ease).
				2) Feedback wipe-down enters inside that space.
				3) After push settles, green box content: initial slides left out, deeper slides left in (no opacity change).
			-->
			<div class={reviewOnly ? "mt-0" : "mt-5"}>
				<div class="feedback-slot" class:feedback-slot--open={feedbackSlotOpen && Boolean(local.feedback)}>
					<div class="feedback-slot__inner">
						{#if showFeedback && local.feedback}
							<div class="feedback-wipe mb-4 flex gap-3 border-l-2 border-[#c9a4a4] bg-red-50/45 px-4 py-3" role="status">
								<AlertCircle class="mt-0.5 size-4 shrink-0 text-red-700" />
								<div>
									<p class="mb-1 text-[10px] font-semibold tracking-[0.14em] text-red-800 uppercase">{feedbackLabel}</p>
									<p class="font-prose text-sm leading-relaxed text-red-950">{local.feedback}</p>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div class="hint-rail" bind:this={hintRailEl} aria-live="polite">
					<div class="hint-track" class:hint-track--deeper={hintShowDeeper} style="--hint-slide-ms: {HINT_SLIDE_MS}ms">
						<div class="hint-panel" id="correction-hint-{cardIndex}-initial" aria-hidden={hintShowDeeper}>
							<Lightbulb class="mt-0.5 size-4 shrink-0 text-[#55705b]" />
							<div class="min-w-0">
								<p class="mb-1 text-[10px] font-semibold tracking-[0.14em] text-[#55705b] uppercase">{hintLabel}</p>
								<div class="hint-markdown prose font-prose text-sm leading-relaxed text-[#34463a]">{@html initialHintHtml}</div>
							</div>
						</div>
						<div class="hint-panel" id="correction-hint-{cardIndex}-deeper" aria-hidden={!hintShowDeeper}>
							<Lightbulb class="mt-0.5 size-4 shrink-0 text-[#55705b]" />
							<div class="min-w-0">
								<p class="mb-1 text-[10px] font-semibold tracking-[0.14em] text-[#55705b] uppercase">{deeperHintLabel}</p>
								<div class="hint-markdown prose font-prose text-sm leading-relaxed text-[#34463a]">{@html deeperHintHtml}</div>
							</div>
						</div>
					</div>
				</div>
				{#if reviewOnly}
					<div class="mt-3 flex justify-end">
						<Button
							variant="ghost"
							size="sm"
							class="text-[#405b47] hover:bg-[#dce8de]/60 hover:text-[#2f4936]"
							aria-expanded={hintShowDeeper}
							aria-controls="correction-hint-{cardIndex}-deeper"
							onclick={() => (hintShowDeeper = !hintShowDeeper)}
						>
							<Lightbulb size={14} />
							{hintShowDeeper ? showInitialHintLabel : showDeeperHintLabel}
						</Button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if isResult}
		<footer class="mt-6 flex items-center justify-end">
			<Button size="icon" class="size-11 rounded-full" aria-label={nextAriaLabel} title={nextAriaLabel} onclick={() => onnext?.()}>
				<ArrowRight />
			</Button>
		</footer>
	{/if}
</section>

<style>
/* —— Submit: slow orbiting highlight arc —— */
.submit-orbit {
	isolation: isolate;
}
.submit-orbit__ring {
	position: absolute;
	inset: -2px;
	border-radius: 9999px;
	background: conic-gradient(
		from 0deg,
		transparent 0deg,
		transparent 255deg,
		color-mix(in oklch, var(--primary) 25%, white) 295deg,
		oklch(0.9 0.09 95) 325deg,
		color-mix(in oklch, var(--primary) 70%, white) 348deg,
		transparent 360deg
	);
	-webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
	mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px));
	opacity: 0;
	transform: rotate(0deg);
	transition: opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1);
	z-index: 0;
	pointer-events: none;
}
.submit-orbit--busy .submit-orbit__ring {
	opacity: 1;
	animation: submit-orbit-spin 1.85s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
}
@keyframes submit-orbit-spin {
	to {
		transform: rotate(360deg);
	}
}

/* —— Feedback: expand slot (pushes hint) + wipe-down enter —— */
.feedback-slot {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows 560ms cubic-bezier(0.22, 1, 0.36, 1);
}
.feedback-slot--open {
	grid-template-rows: 1fr;
}
.feedback-slot__inner {
	min-height: 0;
	overflow: hidden;
}

.feedback-wipe {
	animation: feedback-wipe-down 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes feedback-wipe-down {
	from {
		opacity: 0;
		clip-path: inset(0 0 100% 0);
		transform: translateY(-0.4rem);
	}
	to {
		opacity: 1;
		clip-path: inset(0 0 0 0);
		transform: translateY(0);
	}
}

/* Provider error expand/collapse (same idea as feedback slot). */
.provider-slot {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
.provider-slot--open {
	grid-template-rows: 1fr;
}
.provider-slot__inner {
	min-height: 0;
	overflow: hidden;
}

/*
	 * Hint rail: two solid panels side-by-side.
	 * Viewport shows one panel width; deeper lives just past the right edge.
	 * Slide = pure translateX (no opacity), after feedback push has settled.
	 * Height is set in JS to the active panel so shorter deeper copy leaves no white strip.
	 */
.hint-rail {
	width: 100%;
	overflow: hidden;
	background: color-mix(in oklch, #dde4d8 55%, transparent);
	transition: height 360ms cubic-bezier(0.22, 1, 0.36, 1);
}
.hint-track {
	display: flex;
	align-items: stretch;
	width: 200%;
	transform: translate3d(0, 0, 0);
	transition: transform var(--hint-slide-ms, 620ms) cubic-bezier(0.65, 0, 0.15, 1);
	will-change: transform;
}
.hint-track--deeper {
	transform: translate3d(-50%, 0, 0);
}
.hint-panel {
	display: flex;
	width: 50%;
	flex-shrink: 0;
	align-self: flex-start;
	gap: 0.75rem;
	padding: 1rem;
	box-sizing: border-box;
	background: color-mix(in oklch, #dde4d8 55%, transparent);
}

.hint-markdown :global(p),
.hint-markdown :global(ol),
.hint-markdown :global(ul) {
	margin-bottom: 0.5rem;
}

.hint-markdown :global(:last-child) {
	margin-bottom: 0;
}

.hint-markdown :global(ol),
.hint-markdown :global(ul) {
	padding-left: 1.25rem;
}

@media (prefers-reduced-motion: reduce) {
	.submit-orbit--busy .submit-orbit__ring {
		animation: none;
		opacity: 0.85;
		background: conic-gradient(from 90deg, transparent 0 40%, oklch(0.85 0.06 95) 50%, transparent 70%);
	}
	.feedback-slot,
	.provider-slot,
	.hint-rail {
		transition-duration: 1ms;
	}
	.feedback-wipe {
		animation-duration: 1ms;
	}
	.hint-track {
		transition-duration: 1ms;
	}
}
:global(html.demo-force-reduced) .submit-orbit--busy .submit-orbit__ring {
	animation: none;
	opacity: 0.85;
}
:global(html.demo-force-reduced) .feedback-slot,
:global(html.demo-force-reduced) .provider-slot,
:global(html.demo-force-reduced) .hint-rail {
	transition-duration: 1ms;
}
:global(html.demo-force-reduced) .feedback-wipe {
	animation-duration: 1ms;
}
:global(html.demo-force-reduced) .hint-track {
	transition-duration: 1ms;
}
</style>
