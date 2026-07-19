<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Loader from "@lucide/svelte/icons/loader-circle";
import { autoGrowTextarea } from "$lib/client/auto-grow-textarea";
import { Button } from "$lib/components/ui/button";
import { prefersReducedMotion } from "./motion";
import PracticeCapsule from "./PracticeCapsule.svelte";
import type { PracticeGenStatus, SecondDraftLocalState } from "./types";

const MIN_TEXTAREA_PX = 112;
/** Expand/collapse duration — matches CorrectionCard feedback slot. */
const FEEDBACK_PUSH_MS = 560;

interface Props {
	sourceParagraphs: string[];
	draft: SecondDraftLocalState;
	practiceStatus: PracticeGenStatus;
	title: string;
	sourceLabel: string;
	yourDraftLabel: string;
	submitLabel: string;
	skipLabel: string;
	skipConfirmTitle: string;
	skipConfirmBody: string;
	skipConfirmAction: string;
	waitingPracticeLabel: string;
	generatingLabel: string;
	failedLabel: string;
	readyLabel: string;
	retryLabel: string;
	cancelLabel?: string;
	continueLabel?: string;
	/** Eyebrow for unresolved / pass feedback panels (same role as card feedback). */
	feedbackLabel?: string;
	providerErrorBody?: string | null;
	submitting?: boolean;
	onupdate?: (paragraphIndex: number, value: string) => void;
	onsubmit?: () => void;
	onskip?: () => void;
	oncontinue?: () => void;
	onretryPractice?: () => void;
}

let {
	sourceParagraphs,
	draft,
	practiceStatus,
	title,
	sourceLabel,
	yourDraftLabel,
	submitLabel,
	skipLabel,
	skipConfirmTitle,
	skipConfirmBody,
	skipConfirmAction,
	waitingPracticeLabel,
	generatingLabel,
	failedLabel,
	readyLabel,
	retryLabel,
	cancelLabel = "Cancel",
	continueLabel = "Continue",
	feedbackLabel = "Feedback",
	providerErrorBody = null,
	submitting = false,
	onupdate,
	onsubmit,
	onskip,
	oncontinue,
	onretryPractice,
}: Props = $props();

let confirmSkip = $state(false);
let draftRoot: HTMLElement | null = $state(null);

const finished = $derived(draft.passed || draft.skipped);
const canContinue = $derived(finished && practiceStatus === "ready");
const showUnresolved = $derived(draft.unresolvedOrdinals.length > 0 && !finished);

/** Target open: hide while checking / provider error so reverse-close can run first. */
const wantFeedbackOpen = $derived(Boolean(draft.commentary?.trim()) && !submitting && !providerErrorBody);
const targetCommentary = $derived(draft.commentary?.trim() || null);
const targetTone = $derived(showUnresolved ? ("unresolved" as const) : ("passed" as const));

/**
 * Feedback panel state (CorrectionCard-style expand + wipe).
 * Display fields lag the draft so close anim keeps the old copy mounted.
 */
let feedbackSlotOpen = $state(false);
let feedbackMounted = $state(false);
let displayCommentary = $state<string | null>(null);
let displayTone = $state<"unresolved" | "passed">("unresolved");
let feedbackWipeKey = $state(0);
/** Last open-cycle key so we remount wipe only when starting a new enter. */
let lastOpenCycleKey = "";

/**
 * Close on submit/clear (reverse expand); after LLM settles, wipe-down enter.
 * Uses sync effect + timeout cleanup (same pattern as CorrectionCard).
 */
$effect(() => {
	const open = wantFeedbackOpen;
	const text = targetCommentary;
	const tone = targetTone;
	const reduced = prefersReducedMotion();

	if (!open) {
		// Reverse path: collapse slot, keep old copy until height settles.
		lastOpenCycleKey = "";
		feedbackSlotOpen = false;
		const hideMs = reduced ? 0 : FEEDBACK_PUSH_MS;
		const hideId = window.setTimeout(() => {
			feedbackMounted = false;
		}, hideMs);
		return () => window.clearTimeout(hideId);
	}

	if (!text) return;

	// New enter cycle when opening from closed, or when commentary/tone changes.
	const cycleKey = `${text}\0${tone}`;
	if (cycleKey !== lastOpenCycleKey) {
		lastOpenCycleKey = cycleKey;
		displayCommentary = text;
		displayTone = tone;
		feedbackMounted = true;
		feedbackWipeKey += 1;
		// Start collapsed so grid-template-rows can animate 0fr → 1fr.
		feedbackSlotOpen = false;
	}

	const openDelay = reduced ? 0 : 16;
	const openId = window.setTimeout(() => {
		feedbackSlotOpen = true;
	}, openDelay);

	return () => window.clearTimeout(openId);
});

$effect(() => {
	draft.paragraphs;
	finished;
	if (!draftRoot) return;
	const nodes = draftRoot.querySelectorAll<HTMLTextAreaElement>("textarea[data-second-draft]");
	for (const el of nodes) autoGrowTextarea(el, MIN_TEXTAREA_PX);
});
</script>

<div class="relative mx-auto w-full max-w-3xl" bind:this={draftRoot}>
	<PracticeCapsule status={practiceStatus} {generatingLabel} {failedLabel} {readyLabel} {retryLabel} onretry={onretryPractice} />

	<header class="mb-6 border-b border-border pb-5">
		<p class="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Stage 2</p>
		<h1 class="font-serif text-3xl tracking-tight" tabindex="-1">{title}</h1>
	</header>

	<div class="space-y-6">
		{#each sourceParagraphs as source, i (i)}
			{@const flagged = draft.unresolvedOrdinals.includes(i)}
			<article class="grid gap-4 border-b border-border pb-6 last:border-0">
				<div>
					<p class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{sourceLabel} {i + 1}</p>
					<p class="rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-[0.95rem] leading-relaxed break-words">{source}</p>
				</div>
				<div>
					<label class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" for="second-draft-{i}">
						{yourDraftLabel}
					</label>
					<textarea
						id="second-draft-{i}"
						data-second-draft
						class="min-h-[6.5rem] w-full resize-none overflow-hidden rounded-xl border bg-card min-h-[7rem] px-4 py-3 font-inter-stack text-[0.95rem] leading-relaxed shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40
							{flagged ? 'border-amber-400 ring-2 ring-amber-300/40' : 'border-border'}"
						value={draft.paragraphs[i] ?? ""}
						readonly={finished || submitting}
						oninput={(e) => {
							if (finished || submitting) return;
							const el = e.currentTarget as HTMLTextAreaElement;
							onupdate?.(i, el.value);
							autoGrowTextarea(el, MIN_TEXTAREA_PX);
						}}
					></textarea>
				</div>
			</article>
		{/each}
	</div>

	<footer class="space-y-4 border-t border-border pt-6">
		{#if providerErrorBody}
			<div class="flex gap-3 border-l-2 border-amber-600 bg-amber-50/55 px-4 py-3" role="alert">
				<AlertCircle class="mt-0.5 size-4 shrink-0 text-amber-800" />
				<p class="text-sm leading-relaxed text-amber-950">{providerErrorBody}</p>
			</div>
		{/if}

		<!--
			Feedback slot: expands/collapses via grid-template-rows (same as CorrectionCard).
			Enter = wipe-down; re-check closes with reverse wipe then re-enters after LLM.
		-->
		<div class="feedback-slot" class:feedback-slot--open={feedbackSlotOpen && Boolean(displayCommentary)}>
			<div class="feedback-slot__inner">
				{#if feedbackMounted && displayCommentary}
					{#key feedbackWipeKey}
						<div
							class="feedback-wipe mb-1 flex gap-3 border-l-2 px-4 py-3
								{displayTone === 'unresolved'
								? 'border-[#c9a4a4] bg-red-50/45'
								: 'border-[#8faf8f] bg-emerald-50/40'}"
							role="status"
						>
							{#if displayTone === "unresolved"}
								<AlertCircle class="mt-0.5 size-4 shrink-0 text-red-700" />
							{:else}
								<CheckCircle2 class="mt-0.5 size-4 shrink-0 text-emerald-800" />
							{/if}
							<div class="min-w-0">
								<p
									class="mb-1 text-[10px] font-semibold tracking-[0.14em] uppercase
										{displayTone === 'unresolved' ? 'text-red-800' : 'text-emerald-900'}"
								>
									{feedbackLabel}
								</p>
								<p
									class="text-sm leading-relaxed
										{displayTone === 'unresolved' ? 'text-red-950' : 'text-emerald-950'}"
								>
									{displayCommentary}
								</p>
							</div>
						</div>
					{/key}
				{/if}
			</div>
		</div>

		{#if !finished}
			<div class="flex w-full items-start justify-between gap-3">
				<div class="min-w-0 max-w-[min(100%,28rem)]">
					{#if !confirmSkip}
						<Button variant="ghost" class="px-0 sm:px-3" onclick={() => (confirmSkip = true)} disabled={submitting}> {skipLabel} </Button>
					{:else}
						<div class="flex flex-col gap-2 border border-border bg-muted/40 px-3 py-2 sm:flex-row sm:items-center">
							<div class="min-w-0">
								<p class="text-sm font-medium">{skipConfirmTitle}</p>
								<p class="text-xs text-muted-foreground">{skipConfirmBody}</p>
							</div>
							<div class="flex shrink-0 gap-2">
								<Button size="sm" variant="outline" onclick={() => (confirmSkip = false)}>{cancelLabel}</Button>
								<Button
									size="sm"
									variant="destructive"
									onclick={() => {
										confirmSkip = false;
										onskip?.();
									}}
								>
									{skipConfirmAction}
								</Button>
							</div>
						</div>
					{/if}
				</div>
				<Button class="shrink-0" onclick={() => onsubmit?.()} disabled={submitting}>
					{#if submitting}
						<Loader class="animate-spin" size={16} />
					{/if}
					{submitLabel}
				</Button>
			</div>
		{:else}
			<div class="flex w-full flex-col items-end gap-2">
				{#if !canContinue}
					<p class="w-full text-right text-sm text-muted-foreground">{waitingPracticeLabel}</p>
				{/if}
				<Button onclick={() => oncontinue?.()} disabled={!canContinue}>{continueLabel}</Button>
			</div>
		{/if}
	</footer>
</div>

<style>
/* —— Feedback: expand slot + wipe-down enter (mirrors CorrectionCard) —— */
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

@media (prefers-reduced-motion: reduce) {
	.feedback-slot {
		transition-duration: 1ms;
	}
	.feedback-wipe {
		animation-duration: 1ms;
	}
}
:global(html.demo-force-reduced) .feedback-slot {
	transition-duration: 1ms;
}
:global(html.demo-force-reduced) .feedback-wipe {
	animation-duration: 1ms;
}
</style>
