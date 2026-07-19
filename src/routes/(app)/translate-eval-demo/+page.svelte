<script lang="ts">
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Home from "@lucide/svelte/icons/home";
import { fade } from "svelte/transition";
import { browser } from "$app/environment";
import CorrectionCard from "$lib/components/translate-evaluation/CorrectionCard.svelte";
import EvaluationOverview from "$lib/components/translate-evaluation/EvaluationOverview.svelte";
import EvaluationWaiting from "$lib/components/translate-evaluation/EvaluationWaiting.svelte";
import SecondDraft from "$lib/components/translate-evaluation/SecondDraft.svelte";
import TransferPractice from "$lib/components/translate-evaluation/TransferPractice.svelte";
import type { DemoScene, EvaluationData, LocalCardState, PracticeGenStatus, SecondDraftLocalState } from "$lib/components/translate-evaluation/types";
import { Button } from "$lib/components/ui/button";
import { t } from "$lib/i18n";
import {
	acceptedState,
	DEMO_EVALUATION,
	DEMO_EVALUATION_NO_CARDS,
	DEMO_EVALUATION_WARNING,
	DEMO_LLM_WAIT_MS,
	DEMO_REJECT_FEEDBACK,
	DEMO_SECOND_DRAFT_PASS_COMMENTARY,
	DEMO_SECOND_DRAFT_UNRESOLVED_COMMENTARY,
	DEMO_TRANSFER_NOTES,
	emptyCardState,
	firstRejectState,
	providerErrorState,
	secondRejectState,
} from "./fixtures";

const UI_LANG = "en" as const;

function wait(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const SCENES: Array<{ id: DemoScene; label: string }> = [
	{ id: "evaluating", label: "Evaluating" },
	{ id: "evaluating-failed", label: "Evaluating · failed" },
	{ id: "evaluated", label: "Evaluated (match)" },
	{ id: "evaluated-warning", label: "Evaluated (warning)" },
	{ id: "no-cards", label: "No cards" },
	{ id: "card-initial", label: "Card · initial" },
	{ id: "card-first-reject", label: "Card · first reject" },
	{ id: "card-accept", label: "Card · accept" },
	{ id: "card-second-reject", label: "Card · second reject" },
	{ id: "provider-error", label: "Provider error" },
	{ id: "second-draft-generating", label: "Draft · generating" },
	{ id: "second-draft-failed", label: "Draft · failed" },
	{ id: "second-draft-ready", label: "Draft · ready" },
	{ id: "second-draft-waiting", label: "Draft done · wait practice" },
	{ id: "transfer", label: "Transfer practice" },
	{ id: "complete", label: "Complete" },
];

let scene = $state<DemoScene>("evaluating");
let panelOpen = $state(true);
let simulateMobile = $state(false);
let forceReduced = $state(false);
let overviewConfirmed = $state(false);
let submitting = $state(false);
let transferIndex = $state(0);
/** Bumps so card animation sequences can re-play without leaving the scene. */
let demoRemountKey = $state(0);

let cardState = $state<LocalCardState>(emptyCardState());
let secondDraft = $state<SecondDraftLocalState>(makeSecondDraft(false));
let practiceStatus = $state<PracticeGenStatus>("idle");

const ratingLabels = $derived({
	"eval.rating.accuracy": t(UI_LANG, "eval.rating.accuracy"),
	"eval.rating.naturalness": t(UI_LANG, "eval.rating.naturalness"),
	"eval.rating.grammar": t(UI_LANG, "eval.rating.grammar"),
	"eval.rating.register": t(UI_LANG, "eval.rating.register"),
	"eval.rating.contextualFit": t(UI_LANG, "eval.rating.contextualFit"),
	"eval.rating.overall": t(UI_LANG, "eval.rating.overall"),
});

function makeSecondDraft(passed: boolean): SecondDraftLocalState {
	return {
		paragraphs: [...DEMO_EVALUATION.firstDraftParagraphs],
		unresolvedOrdinals: [],
		passed,
		skipped: false,
		providerError: null,
		commentary: passed ? DEMO_SECOND_DRAFT_PASS_COMMENTARY : null,
	};
}

function applyScene(next: DemoScene) {
	scene = next;
	demoRemountKey += 1;
	overviewConfirmed = false;
	submitting = false;
	transferIndex = 0;

	switch (next) {
		case "card-initial":
			cardState = emptyCardState();
			break;
		case "card-first-reject":
			cardState = firstRejectState();
			break;
		case "card-accept":
			cardState = acceptedState();
			break;
		case "card-second-reject":
			cardState = secondRejectState();
			break;
		case "provider-error":
			cardState = providerErrorState();
			break;
		case "second-draft-generating":
			secondDraft = makeSecondDraft(false);
			practiceStatus = "generating";
			break;
		case "second-draft-failed":
			secondDraft = makeSecondDraft(false);
			practiceStatus = "failed";
			break;
		case "second-draft-ready":
			secondDraft = makeSecondDraft(false);
			practiceStatus = "ready";
			break;
		case "second-draft-waiting":
			secondDraft = makeSecondDraft(true);
			practiceStatus = "generating";
			break;
		case "transfer":
		case "complete":
			practiceStatus = "ready";
			break;
		default:
			practiceStatus = "idle";
	}
}

function activeEvaluation(): EvaluationData {
	if (scene === "evaluated-warning") return DEMO_EVALUATION_WARNING;
	if (scene === "no-cards") return DEMO_EVALUATION_NO_CARDS;
	return DEMO_EVALUATION;
}

async function handleCardSubmit(input: string) {
	if (submitting) return;
	submitting = true;
	cardState = { ...cardState, input };
	await wait(DEMO_LLM_WAIT_MS);
	if (cardState.phase === "initial" || cardState.phase === "provider_error") {
		if (input.toLowerCase().includes("of their") || input.toLowerCase().includes("relationships") || input.length > 120) {
			cardState = {
				...acceptedState(),
				input,
				acceptedAnswer: input,
			};
		} else {
			cardState = {
				phase: "first_reject",
				attemptCount: 1,
				input,
				feedback: DEMO_REJECT_FEEDBACK,
				acceptedAnswer: null,
				acceptedDiff: null,
			};
		}
	} else if (cardState.phase === "first_reject") {
		if (input.length > 40) {
			cardState = {
				...acceptedState(),
				attemptCount: 2,
				input,
				acceptedAnswer: input,
			};
		} else {
			cardState = {
				phase: "second_reject",
				attemptCount: 2,
				input,
				feedback: "第二次尝试仍不够完整。下面给出最小改动与参考改写。",
				acceptedAnswer: null,
				acceptedDiff: null,
			};
		}
	}
	submitting = false;
}

async function handleSecondDraftSubmit() {
	if (submitting) return;
	submitting = true;
	await wait(DEMO_LLM_WAIT_MS);
	if (secondDraft.unresolvedOrdinals.length === 0 && !secondDraft.passed) {
		secondDraft = {
			...secondDraft,
			unresolvedOrdinals: [0],
			commentary: DEMO_SECOND_DRAFT_UNRESOLVED_COMMENTARY,
		};
	} else {
		secondDraft = {
			...secondDraft,
			unresolvedOrdinals: [],
			passed: true,
			commentary: DEMO_SECOND_DRAFT_PASS_COMMENTARY,
		};
	}
	submitting = false;
}

async function handleRegenerate() {
	applyScene("evaluating");
	await wait(DEMO_LLM_WAIT_MS);
	applyScene("evaluated");
}

async function handleRetryPractice() {
	practiceStatus = "generating";
	await wait(DEMO_LLM_WAIT_MS);
	practiceStatus = "ready";
}

$effect(() => {
	if (!browser) return;
	document.documentElement.classList.toggle("demo-force-reduced", forceReduced);
	return () => document.documentElement.classList.remove("demo-force-reduced");
});
</script>

<svelte:head> <title>Translate eval demo · Libiamo</title> </svelte:head>

<div class="relative {simulateMobile ? 'mx-auto max-w-[390px] border-x border-border shadow-sm' : ''}">
	{#key `${scene}:${demoRemountKey}`}
		<div in:fade={{ duration: 180 }}>
			{#if scene === "evaluating" || scene === "evaluating-failed"}
				<EvaluationWaiting
					title={t(UI_LANG, "eval.waiting.evaluating")}
					failed={scene === "evaluating-failed"}
					retryLabel={t(UI_LANG, "common.retry")}
					failedBody={t(UI_LANG, "eval.waiting.failedBody")}
					onretry={() => applyScene("evaluating")}
				/>
			{:else if scene === "evaluated" || scene === "evaluated-warning" || scene === "no-cards"}
				<EvaluationOverview
					evaluation={activeEvaluation()}
					title={t(UI_LANG, "eval.overview.title")}
					subtitle={t(UI_LANG, "eval.overview.subtitle")}
					{ratingLabels}
					continueLabel={t(UI_LANG, "eval.overview.continue")}
					regenerateLabel={t(UI_LANG, "eval.overview.regenerate")}
					yourDraftLabel={t(UI_LANG, "eval.overview.yourDraft")}
					overallLabel={t(UI_LANG, "eval.overview.overall")}
					warningTitle={t(UI_LANG, "eval.overview.warningTitle")}
					warningBody={t(UI_LANG, "eval.overview.warningBody")}
					showRegenerate={scene === "evaluated-warning"}
					{overviewConfirmed}
					oncontinue={() => {
						overviewConfirmed = true;
						if (scene === "no-cards") applyScene("complete");
						else applyScene("card-initial");
					}}
					onregenerate={() => void handleRegenerate()}
				/>
			{:else if scene.startsWith("card-") || scene === "provider-error"}
				<CorrectionCard
					card={DEMO_EVALUATION.cards[0]}
					local={cardState}
					cardIndex={0}
					cardTotal={DEMO_EVALUATION.cards.length}
					titleLabel={t(UI_LANG, "eval.card.title")}
					eyebrowLabel={t(UI_LANG, "eval.card.stage")}
					sourceLabel={t(UI_LANG, "eval.card.source")}
					originalLabel={t(UI_LANG, "eval.card.original")}
					reviseLabel={t(UI_LANG, "eval.card.revise")}
					hintLabel={t(UI_LANG, "eval.card.hint")}
					deeperHintLabel={t(UI_LANG, "eval.card.deeperHint")}
					inputPlaceholder={t(UI_LANG, "eval.card.placeholder")}
					continueLabel={submitting ? t(UI_LANG, "eval.card.verifying") : t(UI_LANG, "eval.card.continue")}
					retryLabel={t(UI_LANG, "common.retry")}
					providerErrorTitle={t(UI_LANG, "eval.card.providerErrorTitle")}
					providerErrorBody={t(UI_LANG, "eval.card.providerErrorBody")}
					nextAriaLabel={t(UI_LANG, "eval.card.nextAria")}
					yourDiffLabel={t(UI_LANG, "eval.card.yourDiff")}
					minimalDiffLabel={t(UI_LANG, "eval.card.minimalDiff")}
					referenceDiffLabel={t(UI_LANG, "eval.card.referenceDiff")}
					feedbackLabel={t(UI_LANG, "eval.card.feedback")}
					teachersNoteLabel={t(UI_LANG, "eval.card.teachersNote")}
					{submitting}
					oninput={(v) => (cardState = { ...cardState, input: v })}
					onsubmit={(input) => void handleCardSubmit(input)}
					onretry={() => {
						// Empty draft only: clear error phase. Non-empty goes through onsubmit (same as ↑).
						cardState = { ...cardState, phase: cardState.attemptCount >= 1 ? "first_reject" : "initial" };
					}}
					onnext={() => {
						applyScene("second-draft-generating");
						void (async () => {
							await wait(DEMO_LLM_WAIT_MS);
							if (scene.startsWith("second-draft")) practiceStatus = "ready";
						})();
					}}
				/>
			{:else if scene.startsWith("second-draft")}
				<SecondDraft
					sourceParagraphs={DEMO_EVALUATION.sourceParagraphs}
					draft={secondDraft}
					{practiceStatus}
					title={t(UI_LANG, "eval.secondDraft.title")}
					sourceLabel={t(UI_LANG, "eval.secondDraft.source")}
					yourDraftLabel={t(UI_LANG, "eval.secondDraft.yourDraft")}
					submitLabel={submitting ? t(UI_LANG, "eval.card.verifying") : t(UI_LANG, "eval.secondDraft.submit")}
					skipLabel={t(UI_LANG, "eval.secondDraft.skip")}
					skipConfirmTitle={t(UI_LANG, "eval.secondDraft.skipConfirmTitle")}
					skipConfirmBody={t(UI_LANG, "eval.secondDraft.skipConfirmBody")}
					skipConfirmAction={t(UI_LANG, "eval.secondDraft.skipConfirmAction")}
					waitingPracticeLabel={t(UI_LANG, "eval.secondDraft.waitingPractice")}
					generatingLabel={t(UI_LANG, "eval.practice.generating")}
					failedLabel={t(UI_LANG, "eval.practice.failed")}
					readyLabel={t(UI_LANG, "eval.practice.ready")}
					retryLabel={t(UI_LANG, "common.retry")}
					cancelLabel={t(UI_LANG, "common.cancel")}
					continueLabel={t(UI_LANG, "eval.overview.continue")}
					feedbackLabel={t(UI_LANG, "eval.card.feedback")}
					{submitting}
					onupdate={(i, v) => {
						const paragraphs = [...secondDraft.paragraphs];
						paragraphs[i] = v;
						secondDraft = { ...secondDraft, paragraphs };
					}}
					onsubmit={() => void handleSecondDraftSubmit()}
					onskip={() =>
						(secondDraft = {
							...secondDraft,
							skipped: true,
							unresolvedOrdinals: [],
							commentary: null,
						})}
					oncontinue={() => applyScene("transfer")}
					onretryPractice={() => void handleRetryPractice()}
				/>
			{:else if scene === "transfer"}
				<TransferPractice
					notes={DEMO_TRANSFER_NOTES}
					currentIndex={transferIndex}
					title={t(UI_LANG, "eval.transfer.title")}
					stageLabel={t(UI_LANG, "eval.transfer.stage")}
					patternLabel={t(UI_LANG, "eval.transfer.pattern")}
					yourAnswerLabel={t(UI_LANG, "eval.transfer.yourAnswer")}
					answerLabel={t(UI_LANG, "eval.transfer.answer")}
					answerPlaceholder={t(UI_LANG, "eval.transfer.placeholder")}
					revealLabel={t(UI_LANG, "eval.transfer.reveal")}
					incorrectLabel={t(UI_LANG, "eval.transfer.incorrect")}
					passLabel={t(UI_LANG, "eval.transfer.pass")}
					deferredLabel={t(UI_LANG, "eval.transfer.deferred")}
					onincorrect={() => {
						transferIndex = Math.min(transferIndex + 1, DEMO_TRANSFER_NOTES.length);
					}}
					onpass={() => {
						transferIndex = Math.min(transferIndex + 1, DEMO_TRANSFER_NOTES.length);
					}}
					onfinish={() => applyScene("complete")}
				/>
			{:else}
				<section class="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-3xl flex-col items-center justify-center text-center" aria-live="polite">
					<CheckCircle2 class="mb-7 size-12 text-[#55705b]" strokeWidth={1.25} />
					<p class="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">{t(UI_LANG, "eval.complete.eyebrow")}</p>
					<h1 tabindex="-1" class="font-serif text-4xl tracking-tight focus:outline-none">{t(UI_LANG, "eval.complete.title")}</h1>
					<p class="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">{t(UI_LANG, "eval.complete.body")}</p>
					<div class="mt-8">
						<Button
							href="/translate"
							size="icon"
							class="size-12 rounded-full"
							aria-label={t(UI_LANG, "eval.complete.homeAria")}
							title={t(UI_LANG, "eval.complete.homeAria")}
						>
							<Home />
						</Button>
					</div>
				</section>
			{/if}
		</div>
	{/key}

	{#if panelOpen}
		<aside
			class="fixed bottom-4 left-4 z-50 max-h-[min(70vh,28rem)] w-[min(100vw-2rem,18rem)] overflow-y-auto rounded-2xl border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur-md"
			aria-label="Demo state switcher"
		>
			<div class="mb-2 flex items-center justify-between gap-2">
				<p class="font-semibold tracking-wide text-muted-foreground uppercase">Demo</p>
				<button type="button" class="text-muted-foreground hover:text-foreground" onclick={() => (panelOpen = false)}>Hide</button>
			</div>
			<div class="mb-3 flex flex-wrap gap-2">
				<label class="inline-flex items-center gap-1.5">
					<input type="checkbox" bind:checked={simulateMobile}>
					390px
				</label>
				<label class="inline-flex items-center gap-1.5">
					<input type="checkbox" bind:checked={forceReduced}>
					reduced-motion
				</label>
			</div>
			<ul class="space-y-0.5">
				{#each SCENES as s (s.id)}
					<li>
						<button
							type="button"
							class="w-full rounded-md px-2 py-1.5 text-left transition-colors {scene === s.id
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-muted'}"
							onclick={() => applyScene(s.id)}
						>
							{s.label}
						</button>
					</li>
				{/each}
			</ul>
		</aside>
	{:else}
		<button
			type="button"
			class="fixed bottom-4 left-4 z-50 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm"
			onclick={() => (panelOpen = true)}
		>
			Demo
		</button>
	{/if}
</div>
