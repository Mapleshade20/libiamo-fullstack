<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Send from "@lucide/svelte/icons/send";
import type { ActionResult } from "@sveltejs/kit";
import { onMount } from "svelte";
import { browser } from "$app/environment";
import { deserialize } from "$app/forms";
import { autoGrowTextarea } from "$lib/client/auto-grow-textarea";
import CorrectionCard from "$lib/components/translate-evaluation/CorrectionCard.svelte";
import DiffView from "$lib/components/translate-evaluation/DiffView.svelte";
import EvaluationOverview from "$lib/components/translate-evaluation/EvaluationOverview.svelte";
import EvaluationWaiting from "$lib/components/translate-evaluation/EvaluationWaiting.svelte";
import SecondDraft from "$lib/components/translate-evaluation/SecondDraft.svelte";
import type { EvaluationData, LocalCardState, SecondDraftLocalState } from "$lib/components/translate-evaluation/types";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";
import { t } from "$lib/i18n";
import type { ChatMessage } from "$lib/server/llm";
import type { ValidatedGeneration1Evaluation } from "$lib/server/translation-evaluation/validation";
import { LIVE_DEMO_TEMPERATURE } from "$lib/translation-evaluation/live-demo-fixture";
import type { TranslationDiffPart } from "$lib/translation-evaluation/types";
import Generation1Inspector from "./Generation1Inspector.svelte";
import {
	DEPRECATED_LIVE_REVIEW_STORAGE_KEYS,
	type GenerationMetadata,
	LIVE_REVIEW_STORAGE_KEY,
	LIVE_TEMPERATURE_STORAGE_KEY,
	type PersistedReview,
	parseLiveDemoTemperature,
	parsePersistedReview,
} from "./session";

type Screen = "answer" | "evaluating" | "failed" | "overview" | "card" | "second-draft";
type CorrectionChecks = {
	allCardIssuesResolved: boolean;
	noNewErrors: boolean;
	fullyNatural: boolean;
};
type CorrectionVerification =
	| { verdict: "reject"; checks: CorrectionChecks; feedback: string }
	| {
			verdict: "accept";
			checks: CorrectionChecks;
			acceptedDiff: string;
			acceptedDiffParts: TranslationDiffPart[] | null;
			acceptedDiffWarning: "accepted_diff_invalid" | null;
	  };
type SecondDraftVerification = { cards: Array<{ ordinal: number; resolved: boolean }>; commentary: string };
type CallArtifact<T> = {
	promptMessages: ChatMessage[];
	rawResponse: string | null;
	metadata: GenerationMetadata | null;
	result: T | null;
	error: string | null;
};
type CorrectionExperiment = {
	input: string;
	call: CallArtifact<CorrectionVerification> | null;
};

const CORRECTION_CHECK_LABELS: Array<{ key: keyof CorrectionChecks; label: string }> = [
	{ key: "allCardIssuesResolved", label: "All card issues resolved" },
	{ key: "noNewErrors", label: "No new errors" },
	{ key: "fullyNatural", label: "Fully natural" },
];

type EvaluationActionData = {
	success?: boolean;
	error?: string;
	learnerParagraphs?: string[];
	evaluation?: ValidatedGeneration1Evaluation;
	promptMessages?: ChatMessage[];
	rawResponse?: string;
	metadata?: GenerationMetadata;
};

type CorrectionActionData = {
	success?: boolean;
	error?: string;
	verification?: CorrectionVerification;
	promptMessages?: ChatMessage[];
	rawResponse?: string;
	metadata?: GenerationMetadata;
};

type SecondDraftActionData = {
	success?: boolean;
	error?: string;
	verification?: SecondDraftVerification;
	promptMessages?: ChatMessage[];
	rawResponse?: string;
	metadata?: GenerationMetadata;
};

let { data } = $props();

const UI_LANG = "en" as const;
let answerRoot: HTMLElement | null = $state(null);
// The live review intentionally starts from the server-provided fixed fixture, then becomes locally editable.
// svelte-ignore state_referenced_locally
let learnerParagraphs = $state([...data.task.defaultLearnerParagraphs]);
// svelte-ignore state_referenced_locally
let promptMessages = $state<ChatMessage[]>([...data.promptMessages]);
let rawResponse = $state<string | null>(null);
let metadata = $state<GenerationMetadata | null>(null);
let evaluation = $state<EvaluationData | null>(null);
let reviewView = $state<Screen>("answer");
let errorMessage = $state<string | null>(null);
let cardIndex = $state(0);
let revealGeneratedAnswers = $state(false);
let persistenceReady = $state(false);
let temperature = $state<number>(LIVE_DEMO_TEMPERATURE.default);
let correctionExperiments = $state<CorrectionExperiment[]>([]);
let correctionSubmitting = $state(false);
let secondDraft = $state<SecondDraftLocalState>({
	paragraphs: [],
	unresolvedOrdinals: [],
	passed: false,
	skipped: false,
	providerError: null,
	commentary: null,
});
let secondDraftSubmitting = $state(false);
let secondDraftCall = $state<CallArtifact<SecondDraftVerification> | null>(null);

const canSubmit = $derived(
	learnerParagraphs.length === data.task.sourceParagraphs.length && learnerParagraphs.every((answer) => answer.trim().length > 0),
);
const activeCard = $derived(evaluation?.cards[cardIndex] ?? null);
const activeExperiment = $derived(correctionExperiments[cardIndex] ?? null);
const activeCorrectionCall = $derived(activeExperiment?.call ?? null);
const ratingLabels = $derived({
	"eval.rating.accuracy": t(UI_LANG, "eval.rating.accuracy"),
	"eval.rating.naturalness": t(UI_LANG, "eval.rating.naturalness"),
	"eval.rating.grammar": t(UI_LANG, "eval.rating.grammar"),
	"eval.rating.overall": t(UI_LANG, "eval.rating.overall"),
});

const reviewCardState = $derived.by<LocalCardState>(() => {
	if (revealGeneratedAnswers) {
		return {
			phase: "second_reject",
			attemptCount: 2,
			input: "",
			feedback: null,
			acceptedAnswer: null,
			acceptedDiff: null,
		};
	}
	return {
		phase: "initial",
		attemptCount: 0,
		input: "",
		feedback: null,
		acceptedAnswer: null,
		acceptedDiff: null,
	};
});

function emptyCorrectionExperiment(): CorrectionExperiment {
	return {
		input: "",
		call: null,
	};
}

function initializeWorkflow(value: EvaluationData): void {
	correctionExperiments = value.cards.map(() => emptyCorrectionExperiment());
	secondDraft = {
		paragraphs: [...value.firstDraftParagraphs],
		unresolvedOrdinals: [],
		passed: false,
		skipped: false,
		providerError: null,
		commentary: null,
	};
	secondDraftCall = null;
}

function removePersistedReview(): void {
	if (!browser) return;
	try {
		sessionStorage.removeItem(LIVE_REVIEW_STORAGE_KEY);
		for (const key of DEPRECATED_LIVE_REVIEW_STORAGE_KEYS) sessionStorage.removeItem(key);
	} catch {
		// The live demo still works when storage is unavailable.
	}
}

onMount(() => {
	try {
		for (const key of DEPRECATED_LIVE_REVIEW_STORAGE_KEYS) sessionStorage.removeItem(key);
		const storedTemperature = parseLiveDemoTemperature(sessionStorage.getItem(LIVE_TEMPERATURE_STORAGE_KEY));
		if (storedTemperature === null && sessionStorage.getItem(LIVE_TEMPERATURE_STORAGE_KEY) !== null) {
			sessionStorage.removeItem(LIVE_TEMPERATURE_STORAGE_KEY);
		} else if (storedTemperature !== null) {
			temperature = storedTemperature;
		}
		const stored = sessionStorage.getItem(LIVE_REVIEW_STORAGE_KEY);
		const restored = stored ? parsePersistedReview(stored, data.task.sourceParagraphs.length) : null;
		if (stored && !restored) removePersistedReview();
		if (restored) {
			learnerParagraphs = [...restored.learnerParagraphs];
			promptMessages = [...restored.promptMessages];
			rawResponse = restored.rawResponse;
			metadata = restored.metadata;
			evaluation = restored.evaluation;
			initializeWorkflow(restored.evaluation);
			cardIndex = Math.max(0, Math.min(restored.cardIndex, restored.evaluation.cards.length - 1));
			revealGeneratedAnswers = restored.revealGeneratedAnswers;
			reviewView = restored.reviewView === "card" && restored.evaluation.cards.length > 0 ? "card" : "overview";
		}
	} catch {
		removePersistedReview();
	} finally {
		persistenceReady = true;
	}
});

$effect(() => {
	if (!browser || !persistenceReady) return;
	try {
		sessionStorage.setItem(LIVE_TEMPERATURE_STORAGE_KEY, String(temperature));
	} catch {
		// The live demo still works when storage is unavailable.
	}
});

$effect(() => {
	if (!browser || !persistenceReady) return;
	if (!evaluation || (reviewView !== "overview" && reviewView !== "card")) {
		if (reviewView === "answer") removePersistedReview();
		return;
	}

	const persisted: PersistedReview = {
		version: 5,
		learnerParagraphs: [...learnerParagraphs],
		promptMessages: [...promptMessages],
		rawResponse,
		metadata,
		evaluation,
		reviewView,
		cardIndex,
		revealGeneratedAnswers,
	};
	try {
		sessionStorage.setItem(LIVE_REVIEW_STORAGE_KEY, JSON.stringify(persisted));
	} catch {
		// Storage quotas and privacy settings must not break the live review flow.
	}
});

$effect(() => {
	learnerParagraphs;
	if (!answerRoot) return;
	for (const textarea of answerRoot.querySelectorAll<HTMLTextAreaElement>("textarea")) autoGrowTextarea(textarea, 144);
});

function toEvaluationData(value: ValidatedGeneration1Evaluation, submittedParagraphs: string[]): EvaluationData {
	return {
		overallCommentary: value.overallCommentary,
		ratings: value.ratings,
		cards: value.cards.map((card) => ({
			ordinal: card.ordinal,
			sourceText: card.sourceText,
			originalAnswer: card.originalAnswer,
			initialHint: card.initialHint,
			deeperHint: card.deeperHint,
			referenceAnswer: card.referenceAnswer,
			referenceMarked: card.referenceMarkedParts,
			minimalAnswer: card.minimalAnswer,
			minimalDiff: card.minimalDiffParts,
			teacherNotes: card.teacherNotes,
			warnings: card.warnings,
		})),
		firstDraft: submittedParagraphs.join("\n\n"),
		firstDraftParagraphs: [...submittedParagraphs],
		sourceParagraphs: [...data.task.sourceParagraphs],
	};
}

async function evaluate() {
	if (!canSubmit || reviewView === "evaluating") return;
	reviewView = "evaluating";
	errorMessage = null;
	rawResponse = null;
	metadata = null;

	const formData = new FormData();
	formData.set("learnerParagraphs", JSON.stringify(learnerParagraphs));
	formData.set("temperature", String(temperature));
	try {
		const response = await fetch("?/evaluate", { method: "POST", body: formData });
		const result = deserialize(await response.text()) as ActionResult<EvaluationActionData>;
		const resultData = result.type === "success" || result.type === "failure" ? result.data : undefined;
		if (result.type !== "success" || !resultData?.evaluation || !resultData.learnerParagraphs || !resultData.promptMessages) {
			if (resultData?.promptMessages) promptMessages = resultData.promptMessages;
			errorMessage = resultData?.error ?? "The model did not return a usable Generation 1 evaluation.";
			reviewView = "failed";
			return;
		}

		learnerParagraphs = [...resultData.learnerParagraphs];
		promptMessages = resultData.promptMessages;
		rawResponse = resultData.rawResponse ?? null;
		metadata = resultData.metadata ?? null;
		evaluation = toEvaluationData(resultData.evaluation, resultData.learnerParagraphs);
		initializeWorkflow(evaluation);
		cardIndex = 0;
		revealGeneratedAnswers = false;
		reviewView = "overview";
	} catch {
		errorMessage = "The Generation 1 request was interrupted. Check the connection and try again.";
		reviewView = "failed";
	}
}

function returnToAnswer() {
	reviewView = "answer";
	errorMessage = null;
	evaluation = null;
	correctionExperiments = [];
	secondDraftCall = null;
	rawResponse = null;
	metadata = null;
}

function showCard(index: number) {
	if (!evaluation?.cards.length) return;
	cardIndex = Math.max(0, Math.min(index, evaluation.cards.length - 1));
	revealGeneratedAnswers = false;
	reviewView = "card";
}

function continueFromOverview() {
	if (evaluation?.cards.length) showCard(0);
	else returnToAnswer();
}

function continueFromCard() {
	if (cardIndex < (evaluation?.cards.length ?? 0) - 1) showCard(cardIndex + 1);
	else openSecondDraft();
}

function updateCorrectionInput(value: string): void {
	if (!activeExperiment) return;
	const next = [...correctionExperiments];
	next[cardIndex] = { ...activeExperiment, input: value };
	correctionExperiments = next;
}

function generationContextFormData(): FormData | null {
	if (!rawResponse) return null;
	const formData = new FormData();
	formData.set("learnerParagraphs", JSON.stringify(learnerParagraphs));
	formData.set("generation1PromptMessages", JSON.stringify(promptMessages));
	formData.set("generation1RawResponse", rawResponse);
	return formData;
}

async function verifyCard(): Promise<void> {
	if (!activeCard || !activeExperiment?.input.trim() || correctionSubmitting) return;
	const formData = new FormData();
	formData.set(
		"card",
		JSON.stringify({
			ordinal: activeCard.ordinal,
			sourceText: activeCard.sourceText,
			originalAnswer: activeCard.originalAnswer,
			initialHint: activeCard.initialHint,
			deeperHint: activeCard.deeperHint,
			referenceAnswer: activeCard.referenceAnswer,
			minimalAnswer: activeCard.minimalAnswer,
			teacherNotes: activeCard.teacherNotes,
		}),
	);
	formData.set("learnerRevision", activeExperiment.input);
	formData.set("displayedHint", revealGeneratedAnswers ? activeCard.deeperHint : activeCard.initialHint);
	correctionSubmitting = true;
	try {
		const response = await fetch("?/verifyCorrection", { method: "POST", body: formData });
		const action = deserialize(await response.text()) as ActionResult<CorrectionActionData>;
		const actionData = action.type === "success" || action.type === "failure" ? action.data : undefined;
		const artifact: CallArtifact<CorrectionVerification> = {
			promptMessages: actionData?.promptMessages ?? [],
			rawResponse: actionData?.rawResponse ?? null,
			metadata: actionData?.metadata ?? null,
			result: action.type === "success" ? (actionData?.verification ?? null) : null,
			error: action.type === "success" ? null : (actionData?.error ?? "The correction verifier did not return a usable result."),
		};
		const current = correctionExperiments[cardIndex];
		if (!current) return;
		const next = [...correctionExperiments];
		next[cardIndex] = {
			...current,
			call: artifact,
		};
		correctionExperiments = next;
	} catch {
		const current = correctionExperiments[cardIndex];
		if (!current) return;
		const next = [...correctionExperiments];
		next[cardIndex] = {
			...current,
			call: { promptMessages: [], rawResponse: null, metadata: null, result: null, error: "The correction-verifier request was interrupted." },
		};
		correctionExperiments = next;
	} finally {
		correctionSubmitting = false;
	}
}

function openSecondDraft(): void {
	if (!evaluation) return;
	if (secondDraft.paragraphs.length !== evaluation.firstDraftParagraphs.length) {
		secondDraft = { ...secondDraft, paragraphs: [...evaluation.firstDraftParagraphs] };
	}
	reviewView = "second-draft";
}

function cardOutcomes(): Array<{ ordinal: number; outcome: "passed" | "revealed" }> {
	return correctionExperiments.map((experiment, ordinal) => ({
		ordinal,
		outcome: experiment.call?.result?.verdict === "accept" ? "passed" : "revealed",
	}));
}

function unresolvedParagraphIndexes(cardOrdinals: number[]): number[] {
	if (!evaluation) return [];
	const currentEvaluation = evaluation;
	return [
		...new Set(
			cardOrdinals.flatMap((ordinal) => {
				const sourceText = currentEvaluation.cards[ordinal]?.sourceText;
				if (!sourceText) return [];
				const paragraphIndex = currentEvaluation.sourceParagraphs.findIndex((paragraph) => paragraph.includes(sourceText));
				return paragraphIndex >= 0 ? [paragraphIndex] : [];
			}),
		),
	];
}

async function verifyDraft(): Promise<void> {
	if (secondDraftSubmitting || secondDraft.paragraphs.some((paragraph) => !paragraph.trim())) return;
	const formData = generationContextFormData();
	if (!formData) return;
	formData.set("secondDraftParagraphs", JSON.stringify(secondDraft.paragraphs));
	formData.set("cardOutcomes", JSON.stringify(cardOutcomes()));
	secondDraftSubmitting = true;
	secondDraft = { ...secondDraft, providerError: null };
	try {
		const response = await fetch("?/verifySecondDraft", { method: "POST", body: formData });
		const action = deserialize(await response.text()) as ActionResult<SecondDraftActionData>;
		const actionData = action.type === "success" || action.type === "failure" ? action.data : undefined;
		secondDraftCall = {
			promptMessages: actionData?.promptMessages ?? [],
			rawResponse: actionData?.rawResponse ?? null,
			metadata: actionData?.metadata ?? null,
			result: action.type === "success" ? (actionData?.verification ?? null) : null,
			error: action.type === "success" ? null : (actionData?.error ?? "The second-draft verifier did not return a usable result."),
		};
		if (action.type !== "success" || !actionData?.verification) {
			secondDraft = { ...secondDraft, providerError: secondDraftCall.error };
			return;
		}
		const unresolvedCardOrdinals = actionData.verification.cards
			.filter((card: { ordinal: number; resolved: boolean }) => !card.resolved)
			.map((card: { ordinal: number; resolved: boolean }) => card.ordinal);
		secondDraft = {
			...secondDraft,
			unresolvedOrdinals: unresolvedParagraphIndexes(unresolvedCardOrdinals),
			passed: unresolvedCardOrdinals.length === 0,
			commentary: actionData.verification.commentary,
			providerError: null,
		};
	} catch {
		const error = "The second-draft verifier request was interrupted.";
		secondDraftCall = { promptMessages: [], rawResponse: null, metadata: null, result: null, error };
		secondDraft = { ...secondDraft, providerError: error };
	} finally {
		secondDraftSubmitting = false;
	}
}
</script>

<svelte:head>
	<title>Translation evaluation live review · Libiamo</title>
	<meta name="description" content="Development-only live review of Generation 1, correction-verifier, and second-draft-verifier prompts.">
</svelte:head>

<div class="mx-auto w-full max-w-5xl">
	<div class="mb-8 flex flex-wrap items-center justify-between gap-3">
		<a href="/translate-eval-demo" class="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
			<ArrowLeft size={15} />
			Static visual demo
		</a>
		<a href="#generation-1-prompt" class="text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground">
			Inspect complete prompt
		</a>
	</div>

	{#if reviewView === "answer"}
		<section bind:this={answerRoot} class="mx-auto w-full max-w-3xl" aria-labelledby="live-demo-title">
			<header class="border-b border-border pb-6">
				<p class="mb-2 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">Generation 1 · Live review</p>
				<h1 id="live-demo-title" class="font-serif text-3xl tracking-tight sm:text-4xl">{data.task.title}</h1>
				<p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{data.task.description}</p>
			</header>

			<div class="mt-8 space-y-9">
				{#each data.task.sourceParagraphs as source, index (index)}
					<article class="grid gap-4 border-b border-border pb-9 last:border-0">
						<div>
							<p class="mb-2 text-[10px] font-semibold tracking-[0.17em] text-muted-foreground uppercase">Source · {index + 1}</p>
							<p class="font-serif text-lg leading-[1.8] text-foreground">{source}</p>
						</div>
						<div>
							<label for="live-answer-{index}" class="mb-2 block text-[10px] font-semibold tracking-[0.17em] text-muted-foreground uppercase">
								Your translation
							</label>
							<textarea
								id="live-answer-{index}"
								class="min-h-36 w-full resize-none overflow-hidden rounded-xl border border-border bg-card/70 px-4 py-3 text-[0.95rem] leading-relaxed shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
								value={learnerParagraphs[index]}
								oninput={(event) => {
									const textarea = event.currentTarget;
									learnerParagraphs[index] = textarea.value;
									learnerParagraphs = [...learnerParagraphs];
									autoGrowTextarea(textarea, 144);
								}}
							></textarea>
						</div>
					</article>
				{/each}
			</div>

			<footer class="mt-8 flex flex-col gap-5 border-t border-border pt-6">
				<p class="max-w-lg text-xs leading-relaxed text-muted-foreground">
					This development route calls the configured provider through the production Generation 1 service. It does not create or update a translation
					attempt.
				</p>
				<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div class="w-full max-w-xs">
						<div class="mb-2 flex items-center justify-between gap-3">
							<label for="live-demo-temperature" class="text-xs font-semibold tracking-[0.12em] text-foreground uppercase">Temperature</label>
							<output for="live-demo-temperature" class="font-mono text-sm tabular-nums text-foreground">{temperature.toFixed(1)}</output>
						</div>
						<input
							id="live-demo-temperature"
							type="range"
							min={LIVE_DEMO_TEMPERATURE.min}
							max={LIVE_DEMO_TEMPERATURE.max}
							step={LIVE_DEMO_TEMPERATURE.step}
							value={temperature}
							class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-stone-300 accent-foreground"
							aria-describedby="live-demo-temperature-help"
							oninput={(event) => (temperature = Number(event.currentTarget.value))}
						>
						<p id="live-demo-temperature-help" class="mt-2 text-xs leading-relaxed text-muted-foreground">
							0.0 is more deterministic; 1.0 allows more variation.
						</p>
					</div>
					<Button data-live-gen1-submit class="shrink-0" disabled={!canSubmit} onclick={() => void evaluate()}
						><Send size={15} />
						Run Generation 1</Button
					>
				</div>
			</footer>
		</section>
	{:else if reviewView === "evaluating" || reviewView === "failed"}
		<EvaluationWaiting
			title={reviewView === "evaluating" ? "Evaluating the Warriors translation" : "Generation 1 failed"}
			failed={reviewView === "failed"}
			retryLabel="Retry Generation 1"
			failedBody={errorMessage ?? "The draft is still available. Retry the same fixed few-shot prompt."}
			onretry={() => void evaluate()}
		/>
		{#if reviewView === "failed"}
			<div class="mx-auto -mt-20 flex max-w-3xl justify-center">
				<Button variant="ghost" onclick={returnToAnswer}><RotateCcw size={14} /> Return to answers</Button>
			</div>
		{/if}
	{:else if reviewView === "overview" && evaluation}
		<EvaluationOverview
			{evaluation}
			title="Translation evaluated"
			subtitle="Generation 1 · Live model"
			{ratingLabels}
			continueLabel={evaluation.cards.length > 0 ? `Review ${evaluation.cards.length} generated cards` : "Edit and run again"}
			regenerateLabel="Run again"
			yourDraftLabel="Submitted draft"
			overallLabel="Overall feedback"
			warningTitle="Some generated fields could not be verified"
			warningBody="Inspect the warning-bearing cards and raw response below. Invalid Diff or reference mark markup uses a safe plain-text fallback."
			showRegenerate={evaluation.cards.some((card) => card.warnings.length > 0)}
			oncontinue={continueFromOverview}
			onregenerate={returnToAnswer}
		/>
		<div class="mx-auto mt-6 flex max-w-3xl justify-end">
			<Button variant="ghost" onclick={returnToAnswer}><RotateCcw size={14} /> Edit and run again</Button>
		</div>
	{:else if reviewView === "card" && evaluation && activeCard}
		<div class="mx-auto mb-6 flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
			<div class="flex items-center gap-2">
				<Button variant="ghost" size="sm" onclick={() => (reviewView = "overview")}><ChevronLeft size={15} /> Overview</Button>
				<Button variant="outline" size="icon-sm" aria-label="Previous card" disabled={cardIndex === 0} onclick={() => showCard(cardIndex - 1)}>
					<ChevronLeft size={15} />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label="Next card"
					disabled={cardIndex >= evaluation.cards.length - 1}
					onclick={() => showCard(cardIndex + 1)}
				>
					<ChevronRight size={15} />
				</Button>
			</div>
			<Button variant="outline" size="sm" onclick={() => (revealGeneratedAnswers = !revealGeneratedAnswers)}>
				{#if revealGeneratedAnswers}
					<EyeOff size={14} />
					Show learner-facing hint
				{:else}
					<Eye size={14} />
					Reveal generated answers
				{/if}
			</Button>
		</div>
		<CorrectionCard
			card={activeCard}
			local={reviewCardState}
			{cardIndex}
			cardTotal={evaluation.cards.length}
			titleLabel="Generated correction card"
			eyebrowLabel="Generation 1 review"
			sourceLabel="Source"
			originalLabel="Original answer"
			reviseLabel="Your revision"
			hintLabel="Initial hint"
			deeperHintLabel="Deeper hint"
			showDeeperHintLabel="Show deeper hint"
			showInitialHintLabel="Show initial hint"
			inputPlaceholder=""
			continueLabel=""
			retryLabel=""
			providerErrorTitle=""
			providerErrorBody=""
			nextAriaLabel={cardIndex < evaluation.cards.length - 1 ? "Next card" : "Back to overview"}
			yourDiffLabel="Your changes"
			minimalDiffLabel="Minimal changes"
			referenceLabel="Reference"
			feedbackLabel="Feedback"
			teacherNotesLabel="Teacher's notes"
			reviewOnly
			onnext={continueFromCard}
		/>
		{#if activeExperiment}
			<section class="mx-auto mt-10 w-full max-w-3xl border-t border-border pt-7" aria-labelledby="correction-verifier-experiment-title">
				<div class="mb-5">
					<p class="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">Correction Verifier · Live experiment</p>
					<h2 id="correction-verifier-experiment-title" class="font-serif text-2xl tracking-tight">Verify this revision</h2>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						The verifier uses only trusted context from this card and runs at temperature 0.2. Its exact request and raw response remain visible
						below.
					</p>
				</div>
				<label for="live-correction-input-{cardIndex}" class="mb-2 block text-sm font-semibold">Your revision</label>
				<Textarea
					id="live-correction-input-{cardIndex}"
					rows={4}
					value={activeExperiment.input}
					readonly={correctionSubmitting}
					class="min-h-28 resize-y bg-card/75 text-base leading-relaxed"
					oninput={(event) => updateCorrectionInput(event.currentTarget.value)}
				/>
				<div class="mt-4 flex justify-end">
					<Button data-live-correction-verifier disabled={!activeExperiment.input.trim() || correctionSubmitting} onclick={() => void verifyCard()}>
						{correctionSubmitting ? "Calling verifier…" : "Run Correction Verifier"}
					</Button>
				</div>

				<article class="mt-6 border border-border bg-card/45 p-4">
					<p class="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Selected card context</p>
					{#if activeCorrectionCall?.result?.verdict === "accept"}
						<p class="mt-2 text-sm font-semibold text-emerald-800">Accepted</p>
						<div class="mt-3">
							{#if activeCorrectionCall.result.acceptedDiffParts}
								<DiffView parts={activeCorrectionCall.result.acceptedDiffParts} />
							{:else}
								<p class="text-sm leading-relaxed">{activeExperiment.input}</p>
							{/if}
						</div>
					{:else if activeCorrectionCall?.result?.verdict === "reject"}
						<p class="mt-2 text-sm font-semibold text-red-800">Rejected</p>
						<p class="mt-2 text-sm leading-relaxed text-red-950">{activeCorrectionCall.result.feedback}</p>
					{:else if activeCorrectionCall?.error}
						<p class="mt-2 text-sm font-semibold text-amber-900">Request failed</p>
						<p class="mt-2 text-sm leading-relaxed text-amber-950">{activeCorrectionCall.error}</p>
					{:else}
						<p class="mt-2 text-sm text-muted-foreground">Not run for this card.</p>
					{/if}
					{#if activeCorrectionCall?.result?.checks}
						<dl class="mt-4 space-y-1.5 border-t border-border pt-3">
							{#each CORRECTION_CHECK_LABELS as check (check.key)}
								<div class="flex items-center justify-between gap-3 text-xs">
									<dt class="text-muted-foreground">{check.label}</dt>
									<dd class={activeCorrectionCall.result.checks[check.key] ? "font-semibold text-emerald-800" : "font-semibold text-red-800"}>
										{activeCorrectionCall.result.checks[check.key] ? "Pass" : "Fail"}
									</dd>
								</div>
							{/each}
						</dl>
					{/if}
					{#if activeCorrectionCall?.promptMessages.length}
						<a
							href="#correction-verifier-{cardIndex}"
							class="mt-3 inline-block text-xs font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
						>
							Inspect exact prompt and raw response
						</a>
					{/if}
				</article>
				<div class="mt-6 flex justify-end">
					<Button data-live-card-continue onclick={continueFromCard}>
						{cardIndex < evaluation.cards.length - 1 ? "Continue to next card" : "Open second draft"}
						<ChevronRight size={15} />
					</Button>
				</div>
			</section>
		{/if}
	{:else if reviewView === "second-draft" && evaluation}
		<div class="mx-auto mb-6 flex w-full max-w-3xl border-b border-border pb-4">
			<Button variant="ghost" size="sm" onclick={() => showCard(Math.max(0, (evaluation?.cards.length ?? 1) - 1))}>
				<ChevronLeft size={15} />
				Correction cards
			</Button>
		</div>
		<SecondDraft
			sourceParagraphs={evaluation.sourceParagraphs}
			draft={secondDraft}
			practiceStatus="ready"
			title="Second draft live verification"
			sourceLabel="Source"
			yourDraftLabel="Your second draft"
			submitLabel={secondDraftSubmitting ? "Verifying second draft…" : "Run Second Draft Verifier"}
			skipLabel="Skip second draft"
			skipConfirmTitle="Skip this live experiment?"
			skipConfirmBody="The Generation 1 and correction-verifier calls remain available below."
			skipConfirmAction="Skip"
			waitingPracticeLabel=""
			generatingLabel=""
			failedLabel=""
			readyLabel="Verifier ready"
			retryLabel="Retry"
			continueLabel="Back to overview"
			feedbackLabel="Second Draft Verifier"
			providerErrorBody={secondDraft.providerError}
			submitting={secondDraftSubmitting}
			onupdate={(index, value) => {
				const paragraphs = [...secondDraft.paragraphs];
				paragraphs[index] = value;
				secondDraft = { ...secondDraft, paragraphs };
			}}
			onsubmit={() => void verifyDraft()}
			onskip={() => (secondDraft = { ...secondDraft, skipped: true, commentary: null, unresolvedOrdinals: [] })}
			oncontinue={() => (reviewView = "overview")}
		/>
		{#if secondDraftCall?.promptMessages.length}
			<div class="mx-auto mt-5 flex w-full max-w-3xl justify-end">
				<a
					href="#second-draft-verifier-prompt"
					class="text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
				>
					Inspect exact Second Draft Verifier call
				</a>
			</div>
		{/if}
	{/if}

	<Generation1Inspector
		messages={promptMessages}
		{rawResponse}
		{metadata}
		description={metadata
			? "These are the complete Generation 1 messages sent to the provider."
			: "This preview uses the prefilled draft; after a run it is replaced by the exact messages sent to the provider. The prompt is fixed to the multi-issue and no-card few-shot protocol."}
	/>
	{#each correctionExperiments as experiment, experimentIndex (experimentIndex)}
		{#if experiment.call && experiment.call.promptMessages.length > 0}
			<Generation1Inspector
				messages={experiment.call.promptMessages}
				rawResponse={experiment.call.rawResponse}
				metadata={experiment.call.metadata}
				sectionId="correction-verifier-{experimentIndex}"
				eyebrow="Correction Verifier · Card {experimentIndex + 1}"
				title="Selected-card context"
				description="This request contains only the verifier instruction, trusted context from this selected card, and the learner revision."
				promptOpen={false}
			/>
		{/if}
	{/each}
	{#if secondDraftCall && secondDraftCall.promptMessages.length > 0}
		<Generation1Inspector
			messages={secondDraftCall.promptMessages}
			rawResponse={secondDraftCall.rawResponse}
			metadata={secondDraftCall.metadata}
			sectionId="second-draft-verifier-prompt"
			eyebrow="Second Draft Verifier"
			title="Generation 1 history + second draft"
			description="The verifier system instruction and complete second draft are appended after the exact successful Generation 1 conversation."
		/>
	{/if}
</div>
