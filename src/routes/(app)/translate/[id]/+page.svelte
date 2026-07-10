<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Check from "@lucide/svelte/icons/check";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Clock from "@lucide/svelte/icons/clock";
import Gem from "@lucide/svelte/icons/gem";
import Loader from "@lucide/svelte/icons/loader-circle";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Send from "@lucide/svelte/icons/send";
import Star from "@lucide/svelte/icons/star";
import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import {
	parseTranslationDraft,
	serializeTranslationDraft,
	type TranslationDraftAnswer,
	translationDraftStorageKey,
} from "$lib/client/translation-draft";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import EvaluationSummary from "$lib/components/translate/EvaluationSummary.svelte";
import BottomSheet from "$lib/components/ui/bottom-sheet/BottomSheet.svelte";
import { Button } from "$lib/components/ui/button";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { renderMarkdown } from "$lib/markdown";
import type { ActionNotificationContent } from "$lib/notifications";

type Answer = TranslationDraftAnswer;
type ParagraphEvaluation = { paragraphIndex: number; feedback: string; rewriteSuggestion: string };
type Evaluation = { overallScore: "A" | "B" | "C"; overallFeedback: string; paragraphs: ParagraphEvaluation[] };

let { data } = $props();
let tpl = $derived(data.template);
let attempt = $derived(data.attempt);
let answers = $state<Answer[]>([]);
let initializedAttemptId = $state<number | null>(null);
let autoPreparedTemplateId = $state<number | null>(null);
let preparing = $state(false);
let evaluating = $state(false);
let showConfirmation = $state(false);
let candidatePickerIndex = $state<number | null>(null);
let expandedReferences = $state<Set<number>>(new Set());
let tutorQuestions = $state<Record<number, string>>({});
let tutorAnswers = $state<Record<number, string>>({});
let tutorLoading = $state<Set<number>>(new Set());
let notificationKey = $state(0);
let actionNotification = $state<ActionNotificationContent | null>(null);

let isDraft = $derived(attempt?.status === "draft");
let isSubmitted = $derived(attempt?.status === "submitted");
let isEvaluated = $derived(attempt?.status === "evaluated");
let allComplete = $derived(answers.length > 0 && answers.every((answer) => answer.translation.trim().length > 0));
let evaluation = $derived((attempt?.evaluation ?? null) as Evaluation | null);

$effect(() => {
	if (!attempt || initializedAttemptId === attempt.id) return;
	initializedAttemptId = attempt.id;
	const initialAnswers = attempt.answers.map((answer: Answer) => ({ ...answer, translation: attempt.status === "draft" ? "" : answer.translation }));
	answers = attempt.status === "draft" ? loadSessionDraft(attempt.id, initialAnswers, attempt.candidates) : initialAnswers;
	if (attempt.status === "draft") persistSessionDraft();
});

$effect(() => {
	if (attempt && attempt.status !== "draft") clearSessionDraft(attempt.id);
});

$effect(() => {
	if (data.prepared || data.blockedReason || autoPreparedTemplateId === tpl.id) return;
	autoPreparedTemplateId = tpl.id;
	void prepareTranslation();
});

function notify(variant: "success" | "error" | "info", title: string, message: string) {
	notificationKey += 1;
	actionNotification = { variant, title, message, key: notificationKey };
}

async function postAction(action: string, form: FormData) {
	const response = await fetch(`?/${action}`, { method: "POST", body: form });
	return deserialize(await response.text()) as { type: string; data?: Record<string, unknown> };
}

function resultError(result: { type: string; data?: Record<string, unknown> }, fallback: string) {
	return result.type === "failure" && typeof result.data?.error === "string" ? result.data.error : fallback;
}

async function prepareTranslation() {
	preparing = true;
	try {
		const result = await postAction("prepare", new FormData());
		if (result.type !== "success") {
			notify("error", "Unable to prepare translation", resultError(result, "Please try again."));
			return;
		}
		await invalidateAll();
	} catch {
		notify("error", "Unable to prepare translation", "Please check your connection and try again.");
	} finally {
		preparing = false;
	}
}

function updateAnswer(paragraphIndex: number, patch: Partial<Answer>) {
	answers = answers.map((answer) => (answer.paragraphIndex === paragraphIndex ? { ...answer, ...patch } : answer));
	persistSessionDraft();
}

function chooseCandidate(paragraphIndex: number, candidateIndex: number) {
	updateAnswer(paragraphIndex, { candidateIndex });
	candidatePickerIndex = null;
}

function loadSessionDraft(attemptId: number, fallback: Answer[], candidates: string[][]): Answer[] {
	if (typeof sessionStorage === "undefined") return fallback;
	try {
		return parseTranslationDraft(
			sessionStorage.getItem(translationDraftStorageKey(attemptId)),
			fallback,
			candidates.map((candidateSet) => candidateSet.length),
		);
	} catch {
		return fallback;
	}
}

function persistSessionDraft() {
	if (!attempt || !isDraft || typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.setItem(translationDraftStorageKey(attempt.id), serializeTranslationDraft(answers));
	} catch {
		// Storage can be unavailable in restricted browser contexts.
	}
}

function clearSessionDraft(attemptId: number) {
	if (typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.removeItem(translationDraftStorageKey(attemptId));
	} catch {
		// Storage can be unavailable in restricted browser contexts.
	}
}

function answerFormData() {
	const form = new FormData();
	form.set("attemptId", String(attempt?.id));
	form.set("answers", JSON.stringify(answers));
	return form;
}

async function submitTranslation() {
	if (!attempt || !allComplete) return;
	showConfirmation = false;
	evaluating = true;
	try {
		const result = await postAction("submit", answerFormData());
		if (result.type !== "success") {
			const submitted = result.type === "failure" && result.data?.submitted === true;
			if (submitted) clearSessionDraft(attempt.id);
			notify(
				"error",
				submitted ? "Submitted; evaluation pending" : "Unable to submit",
				resultError(result, submitted ? "Your answers were saved. Retry the Tutor evaluation when ready." : "Please try again."),
			);
			await invalidateAll();
			return;
		}
		clearSessionDraft(attempt.id);
		await invalidateAll();
		notify("success", "Evaluation ready", "The Tutor has reviewed every paragraph.");
	} catch {
		notify("error", "Evaluation interrupted", "Reload the page. If your submission was saved, you can retry evaluation without submitting again.");
		await invalidateAll();
	} finally {
		evaluating = false;
	}
}

async function retryEvaluation() {
	if (!attempt) return;
	evaluating = true;
	const form = new FormData();
	form.set("attemptId", String(attempt.id));
	try {
		const result = await postAction("retryEvaluation", form);
		if (result.type !== "success") {
			notify("error", "Evaluation failed", resultError(result, "Please try again."));
			return;
		}
		await invalidateAll();
		notify("success", "Evaluation ready", "The Tutor has reviewed your translation.");
	} catch {
		notify("error", "Evaluation failed", "Please check your connection and try again.");
	} finally {
		evaluating = false;
	}
}

function toggleReference(paragraphIndex: number) {
	const next = new Set(expandedReferences);
	if (next.has(paragraphIndex)) next.delete(paragraphIndex);
	else next.add(paragraphIndex);
	expandedReferences = next;
}

async function askTutor(paragraphIndex: number) {
	if (!attempt) return;
	const question = tutorQuestions[paragraphIndex]?.trim();
	if (!question) return;
	tutorLoading = new Set([...tutorLoading, paragraphIndex]);
	const form = new FormData();
	form.set("attemptId", String(attempt.id));
	form.set("paragraphIndex", String(paragraphIndex));
	form.set("question", question);
	try {
		const result = await postAction("askTutor", form);
		if (result.type === "success" && typeof result.data?.answer === "string") {
			tutorAnswers = { ...tutorAnswers, [paragraphIndex]: result.data.answer };
		} else {
			notify("error", "Tutor unavailable", resultError(result, "Please try again."));
		}
	} catch {
		notify("error", "Tutor unavailable", "Please check your connection and try again.");
	} finally {
		tutorLoading = new Set([...tutorLoading].filter((index) => index !== paragraphIndex));
	}
}
</script>

<svelte:head><title>{tpl.title} · Translation</title></svelte:head>
<ActionNotification notification={actionNotification} />

<main class="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col px-5 py-8 sm:px-8 lg:px-12">
	<a href="/translate" class="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
		<ArrowLeft size={15} />
		Back to translations
	</a>

	<header class="border-b border-border pb-8">
		<p class="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Translation Studio</p>
		<h1 class="max-w-3xl text-2xl md:text-3xl leading-tight">{tpl.title}</h1>
		{#if tpl.description}
			<p class="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{tpl.description}</p>
		{/if}
	</header>

	{#if data.blockedReason}
		<section class="my-12 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50/70 p-6">
			<div class="flex gap-3">
				<AlertCircle class="mt-0.5 text-amber-700" size={20} />
				<div>
					<h2 class="font-serif text-2xl">Language settings needed</h2>
					<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
						{data.blockedReason === "same-language"
							? "Your native language and learning language are the same. Choose a different native language to create a useful translation prompt."
							: "Set your native language so Libiamo can prepare the prompt you will translate back into your learning language."}
					</p>
					<Button href="/profile" class="mt-5">Open language settings</Button>
				</div>
			</div>
		</section>
	{:else if !data.prepared}
		<section class="my-16 flex flex-col items-center text-center">
			<Loader class="animate-spin text-muted-foreground" size={28} />
			<h2 class="mt-5 font-serif text-2xl">Preparing three natural versions per paragraph</h2>
			<p class="mt-2 max-w-lg text-sm text-muted-foreground">
				This happens once for this text and native language; future learners reuse the prepared set.
			</p>
			{#if !preparing}
				<Button onclick={prepareTranslation} class="mt-5">Try again</Button>
			{/if}
		</section>
	{:else if attempt}
		<section class="py-10">
			{#if isSubmitted}
				<div class="mb-8 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 sm:flex sm:items-center sm:justify-between">
					<div>
						<h2 class="font-serif text-xl">Your submission is safely recorded</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							Your answers and candidate votes are stored in server. Only the tutor evaluation needs retrying.
						</p>
					</div>
					<Button onclick={retryEvaluation} disabled={evaluating} class="mt-4 sm:mt-0"
						><RotateCcw size={14} /> {evaluating ? "Evaluating…" : "Retry evaluation"}</Button
					>
				</div>
			{/if}

			{#if evaluation}
				<div class="mb-8 max-w-2xl"><EvaluationSummary overallScore={evaluation.overallScore} overallFeedback={evaluation.overallFeedback} /></div>
			{/if}

			<div class="space-y-10">
				{#each answers as answer, index (answer.paragraphIndex)}
					{@const paragraphEvaluation = evaluation?.paragraphs.find((item) => item.paragraphIndex === answer.paragraphIndex)}
					<article class="grid gap-5 border-b border-border pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
						<div>
							<div class="mb-3 flex items-center justify-between gap-3">
								<span class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Paragraph {index + 1}</span>
								{#if isDraft}
									<button
										type="button"
										onclick={() => (candidatePickerIndex = answer.paragraphIndex)}
										class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
									>
										Version {answer.candidateIndex + 1}<ChevronDown size={13} />
									</button>
								{/if}
							</div>
							<button
								type="button"
								disabled={!isDraft}
								onclick={() => (candidatePickerIndex = answer.paragraphIndex)}
								class="w-full text-left font-serif text-xl leading-relaxed disabled:cursor-default"
							>
								{attempt.candidates[answer.paragraphIndex][answer.candidateIndex]}
							</button>
						</div>

						<div class="space-y-4">
							{#if isDraft}
								<textarea
									class="min-h-32 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed outline-none transition-shadow focus:ring-2 focus:ring-foreground/15"
									placeholder={`Translate paragraph ${index + 1} into ${tpl.language.toUpperCase()}…`}
									maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
									value={answer.translation}
									oninput={(event) => updateAnswer(answer.paragraphIndex, { translation: (event.currentTarget as HTMLTextAreaElement).value })}
								></textarea>
							{:else}
								<div>
									<p class="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Your translation</p>
									<p class="text-base leading-relaxed">{answer.translation}</p>
								</div>
								{#if paragraphEvaluation}
									<div class="rounded-xl border border-border bg-foreground/[0.025] p-4">
										<p class="text-sm leading-relaxed">{paragraphEvaluation.feedback}</p>
										<p class="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Suggested rewrite</p>
										<p class="mt-1 text-sm leading-relaxed">{paragraphEvaluation.rewriteSuggestion}</p>
									</div>
								{/if}
								{#if attempt.referenceParagraphs}
									<button
										type="button"
										onclick={() => toggleReference(answer.paragraphIndex)}
										class="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
									>
										{expandedReferences.has(answer.paragraphIndex) ? "Hide" : "Show"}
										authentic reference
									</button>
									{#if expandedReferences.has(answer.paragraphIndex)}
										<p class="rounded-lg border-l-2 border-foreground/20 bg-foreground/[0.025] px-4 py-3 text-sm leading-relaxed">
											{attempt.referenceParagraphs[answer.paragraphIndex]}
										</p>
									{/if}
								{/if}
								{#if isEvaluated}
									<div class="flex gap-2">
										<input
											class="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
											maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
											placeholder="Ask about this paragraph…"
											value={tutorQuestions[answer.paragraphIndex] ?? ""}
											oninput={(event) => (tutorQuestions = { ...tutorQuestions, [answer.paragraphIndex]: (event.currentTarget as HTMLInputElement).value })}
										>
										<Button
											size="sm"
											variant="outline"
											onclick={() => askTutor(answer.paragraphIndex)}
											disabled={tutorLoading.has(answer.paragraphIndex)}
											>{tutorLoading.has(answer.paragraphIndex) ? "Thinking…" : "Ask"}</Button
										>
									</div>
									{#if tutorAnswers[answer.paragraphIndex]}
										<div class="prose prose-sm max-w-none rounded-lg bg-foreground/[0.025] p-4">
											{@html renderMarkdown(tutorAnswers[answer.paragraphIndex])}
										</div>
									{/if}
								{/if}
							{/if}
						</div>
					</article>
				{/each}
			</div>

			{#if tpl.materialsMd}
				<div class="prose prose-neutral mt-10 max-w-2xl">{@html renderMarkdown(tpl.materialsMd)}</div>
			{/if}

			<footer class="mt-12 flex flex-col gap-5 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5"><Star size={14} />{tpl.pointReward} pts</span>
					<span class="flex items-center gap-1.5"><Gem size={14} />{tpl.gemReward} gems</span>
					{#if tpl.estimatedWords}
						<span class="flex items-center gap-1.5"><Clock size={14} />~{tpl.estimatedWords} words</span>
					{/if}
				</div>
				{#if isDraft}
					<Button onclick={() => (showConfirmation = true)} disabled={!allComplete || evaluating}><Send size={14} /> Review & submit</Button>
				{/if}
			</footer>
		</section>
	{/if}
</main>

{#if attempt && candidatePickerIndex !== null}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
		role="presentation"
		onclick={(event) => { if (event.currentTarget === event.target) candidatePickerIndex = null; }}
	>
		<div class="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl border border-border bg-background p-5 shadow-xl">
			<div class="mb-5 flex items-center justify-between">
				<div>
					<p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">Paragraph {candidatePickerIndex + 1}</p>
					<h2 class="mt-1 font-serif text-2xl">Choose a prompt version</h2>
				</div>
				<Button variant="ghost" onclick={() => (candidatePickerIndex = null)}>Close</Button>
			</div>
			<div class="space-y-3">
				{#each attempt.candidates[candidatePickerIndex] as candidate, candidateIndex}
					<button
						type="button"
						onclick={() => chooseCandidate(Number(candidatePickerIndex), candidateIndex)}
						class="flex w-full gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-foreground/[0.035] {answers[candidatePickerIndex]?.candidateIndex === candidateIndex ? 'border-foreground bg-foreground/[0.035]' : 'border-border'}"
					>
						<span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-current"
							>{#if answers[candidatePickerIndex]?.candidateIndex === candidateIndex}
								<Check size={13} />
							{/if}</span
						>
						<span class="font-serif text-lg leading-relaxed">{candidate}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

{#if attempt}
	<BottomSheet
		show={showConfirmation}
		title="Vote for prompts"
		confirmLabel={evaluating ? "Evaluating…" : "Confirm"}
		confirmDisabled={evaluating}
		cancelLabel="Keep editing"
		onConfirm={submitTranslation}
		onCancel={() => (showConfirmation = false)}
	>
		{#snippet children()}
			<p class="mb-5 text-sm text-muted-foreground">Which prompt do you think is the most natural for each paragraph?</p>
			<div class="space-y-5">
				{#each answers as answer, index}
					<div class="space-y-2">
						<p class="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Paragraph {index + 1}</p>
						{#each attempt.candidates[answer.paragraphIndex] as candidate, candidateIndex}
							<label class="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm leading-relaxed"
								><input
									type="radio"
									name={`confirm-${answer.paragraphIndex}`}
									checked={answer.candidateIndex === candidateIndex}
									onchange={() => updateAnswer(answer.paragraphIndex, { candidateIndex })}
								><span>{candidate}</span></label
							>
						{/each}
					</div>
				{/each}
			</div>
		{/snippet}
	</BottomSheet>
{/if}
