<script lang="ts">
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Home from "@lucide/svelte/icons/home";
import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import {
	advanceTranslationTransferQueue,
	clearTranslationFeedbackSnapshot,
	emptyTranslationFeedbackSnapshot,
	parseTranslationFeedbackSnapshot,
	saveTranslationFeedbackSnapshot,
	type TranslationFeedbackSnapshot,
	translationFeedbackSnapshotKey,
} from "$lib/client/translation-feedback-snapshot";
import CorrectionCard from "$lib/components/translate-evaluation/CorrectionCard.svelte";
import EvaluationOverview from "$lib/components/translate-evaluation/EvaluationOverview.svelte";
import EvaluationWaiting from "$lib/components/translate-evaluation/EvaluationWaiting.svelte";
import SecondDraft from "$lib/components/translate-evaluation/SecondDraft.svelte";
import TransferPractice from "$lib/components/translate-evaluation/TransferPractice.svelte";
import type { PracticeGenStatus, TransferNoteFixture } from "$lib/components/translate-evaluation/types";
import { Button } from "$lib/components/ui/button";
import { type LanguageCode, t } from "$lib/i18n";
import { randomExampleIndex } from "$lib/note";

let { data } = $props();
let lang = $derived(data.user.activeLanguage as LanguageCode);
let evaluationRunning = $state(false);
let evaluationFailed = $state(false);
let regenerating = $state(false);
let submitting = $state(false);
let snapshot = $state<TranslationFeedbackSnapshot | null>(null);
let initializedVersion = $state<string | null>(null);
let practiceStatus = $state<PracticeGenStatus>("idle");
let practiceError = $state<string | null>(null);
let transferStartedAt = $state(0);
let completingTransfer = $state(false);
let lastFocusKey = $state("");

const ratingLabels = $derived({
	"eval.rating.accuracy": t(lang, "eval.rating.accuracy"),
	"eval.rating.naturalness": t(lang, "eval.rating.naturalness"),
	"eval.rating.grammar": t(lang, "eval.rating.grammar"),
	"eval.rating.overall": t(lang, "eval.rating.overall"),
});
const reviewCountLabels = $derived({
	new: t(lang, "review.count.new"),
	learning: t(lang, "review.count.learning"),
	review: t(lang, "review.count.review"),
});

$effect(() => {
	if (data.attempt.workflowPhase !== "submitted" || evaluationRunning || evaluationFailed) return;
	void runEvaluation();
});

$effect(() => {
	const focusKey = `${data.attempt.workflowPhase}:${snapshot?.correctionStep ?? ""}:${snapshot?.currentCardIndex ?? ""}`;
	if (focusKey === lastFocusKey) return;
	lastFocusKey = focusKey;
	const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>('h1[tabindex="-1"]')?.focus({ preventScroll: true }));
	return () => cancelAnimationFrame(frame);
});

$effect(() => {
	if (
		data.attempt.workflowPhase === "transfer" &&
		practiceStatus === "ready" &&
		snapshot?.transfer.initialized &&
		snapshot.transfer.queue.length === 0 &&
		!completingTransfer
	) {
		void completeTransfer();
	}
});

$effect(() => {
	if (data.attempt.practiceGeneratedAt) {
		practiceStatus = "ready";
		practiceError = null;
		return;
	}
	if (!["second_draft", "transfer"].includes(data.attempt.workflowPhase) || practiceStatus !== "idle") return;
	void generatePractice();
});

$effect(() => {
	if (data.attempt.workflowPhase !== "transfer" || practiceStatus !== "ready" || !snapshot || snapshot.transfer.initialized) return;
	const queue = data.practiceNotes.map((note) => ({
		noteId: note.id,
		exampleIndex: randomExampleIndex(note.examples),
		queueKind: note.queueKind,
	}));
	persist({ ...snapshot, transfer: { initialized: true, queue } });
	transferStartedAt = Date.now();
});

$effect(() => {
	if (data.attempt.workflowPhase === "transfer" && practiceStatus === "ready" && snapshot?.transfer.initialized && transferStartedAt === 0) {
		transferStartedAt = Date.now();
	}
});

$effect(() => {
	if (!data.evaluation || !data.attempt.evaluatedAt || initializedVersion === data.attempt.evaluatedAt) return;
	initializedVersion = data.attempt.evaluatedAt;
	const expected = { attemptId: data.attempt.id, evaluatedAt: data.attempt.evaluatedAt, cardCount: data.evaluation.cards.length };
	let restored: TranslationFeedbackSnapshot | null = null;
	try {
		restored = parseTranslationFeedbackSnapshot(sessionStorage.getItem(translationFeedbackSnapshotKey(data.attempt.id)), expected);
	} catch {
		/* unavailable */
	}
	if (!restored) {
		clearTranslationFeedbackSnapshot(data.attempt.id);
		restored = emptyTranslationFeedbackSnapshot({ ...expected, firstDraftParagraphs: data.evaluation.firstDraftParagraphs });
	}
	snapshot = restored;
});

function persist(next: TranslationFeedbackSnapshot) {
	snapshot = next;
	saveTranslationFeedbackSnapshot(next);
}

async function postAction(name: string, form = new FormData()) {
	const response = await fetch(`?/${name}`, { method: "POST", body: form });
	return deserialize(await response.text()) as { type: string; status?: number; data?: Record<string, any> };
}

async function runEvaluation() {
	evaluationRunning = true;
	evaluationFailed = false;
	try {
		const result = await postAction("retryEvaluation");
		if (result.type !== "success") {
			evaluationFailed = true;
			return;
		}
		await invalidateAll();
	} catch {
		evaluationFailed = true;
	} finally {
		evaluationRunning = false;
	}
}

async function regenerate() {
	if (regenerating) return;
	regenerating = true;
	try {
		const result = await postAction("regenerate");
		if (result.type !== "success") return;
		clearTranslationFeedbackSnapshot(data.attempt.id);
		initializedVersion = null;
		await invalidateAll();
	} finally {
		regenerating = false;
	}
}

async function generatePractice() {
	if (!data.attempt.evaluatedAt || practiceStatus === "generating") return;
	practiceStatus = "generating";
	practiceError = null;
	const form = new FormData();
	form.set("evaluatedAt", data.attempt.evaluatedAt);
	try {
		const result = await postAction("generatePractice", form);
		if (result.type !== "success") {
			practiceStatus = "failed";
			practiceError = typeof result.data?.error === "string" ? result.data.error : "Practice generation failed.";
			return;
		}
		practiceStatus = "ready";
		await invalidateAll();
	} catch {
		practiceStatus = "failed";
		practiceError = "Practice generation failed.";
	}
}

async function continueOverview() {
	if (!snapshot || !data.evaluation || !data.attempt.evaluatedAt) return;
	if (data.evaluation.cards.length > 0) {
		persist({ ...snapshot, correctionStep: "cards" });
		return;
	}
	await finishCorrections();
}

async function finishCorrections() {
	if (!data.attempt.evaluatedAt) return;
	const form = new FormData();
	form.set("evaluatedAt", data.attempt.evaluatedAt);
	const result = await postAction("finishCorrections", form);
	if (result.type !== "success") return;
	if (result.data?.workflowPhase === "completed") clearTranslationFeedbackSnapshot(data.attempt.id);
	await invalidateAll();
}

async function verifyCard(input: string) {
	if (!snapshot || !data.evaluation || !data.attempt.evaluatedAt || submitting) return;
	const index = snapshot.currentCardIndex;
	const local = snapshot.cards[index];
	const form = new FormData();
	form.set("evaluatedAt", data.attempt.evaluatedAt);
	form.set("cardOrdinal", String(index));
	form.set("hintLevel", local.attemptCount > 0 ? "deeper" : "initial");
	form.set("learnerRevision", input);
	submitting = true;
	try {
		const result = await postAction("verifyCorrection", form);
		if (result.type !== "success" || !result.data?.verification) {
			const cards = [...snapshot.cards];
			cards[index] = { ...local, input, phase: "provider_error" };
			persist({ ...snapshot, cards });
			return;
		}
		const verification = result.data.verification;
		const cards = [...snapshot.cards];
		if (verification.verdict === "accept") {
			cards[index] = {
				phase: "accepted",
				attemptCount: local.attemptCount + 1,
				input,
				feedback: null,
				acceptedAnswer: input,
				acceptedDiff: verification.acceptedDiffParts ?? null,
			};
		} else if (local.attemptCount === 0) {
			cards[index] = { ...local, phase: "first_reject", attemptCount: 1, input, feedback: verification.feedback };
		} else {
			cards[index] = { ...local, phase: "second_reject", attemptCount: 2, input, feedback: verification.feedback };
		}
		persist({ ...snapshot, cards });
	} finally {
		submitting = false;
	}
}

async function nextCard() {
	if (!snapshot || !data.evaluation) return;
	if (snapshot.currentCardIndex + 1 < data.evaluation.cards.length) {
		persist({ ...snapshot, currentCardIndex: snapshot.currentCardIndex + 1 });
		return;
	}
	await finishCorrections();
}

function secondDraftSourceIndices(unresolvedCardOrdinals: number[]) {
	if (!data.evaluation) return [];
	return [
		...new Set(
			unresolvedCardOrdinals
				.map((ordinal) => {
					const sourceText = data.evaluation?.cards[ordinal]?.sourceText ?? "";
					return data.evaluation?.sourceParagraphs.findIndex((paragraph) => paragraph.includes(sourceText)) ?? -1;
				})
				.filter((index) => index >= 0),
		),
	];
}

async function submitSecondDraft() {
	if (!snapshot || !data.evaluation || !data.attempt.evaluatedAt || submitting) return;
	const previous = snapshot.secondDraft;
	persist({ ...snapshot, secondDraft: { ...previous, commentary: null, providerError: null } });
	const payload = {
		evaluatedAt: data.attempt.evaluatedAt,
		paragraphs: previous.paragraphs,
		cardOutcomes: snapshot.cards.map((card, ordinal) => ({
			ordinal,
			outcome: card.phase === "accepted" ? "passed" : "revealed",
		})),
	};
	const form = new FormData();
	form.set("payload", JSON.stringify(payload));
	submitting = true;
	try {
		const result = await postAction("verifySecondDraft", form);
		if (result.type !== "success" || !result.data?.verification) {
			persist({
				...snapshot,
				secondDraft: { ...previous, commentary: null, providerError: result.data?.error ?? "The tutor could not verify this draft." },
			});
			return;
		}
		const verification = result.data.verification;
		const unresolvedCards = verification.cards
			.filter((card: { resolved: boolean }) => !card.resolved)
			.map((card: { ordinal: number }) => card.ordinal);
		persist({
			...snapshot,
			secondDraft: {
				...previous,
				unresolvedOrdinals: secondDraftSourceIndices(unresolvedCards),
				passed: unresolvedCards.length === 0,
				commentary: verification.commentary,
				providerError: null,
			},
		});
	} finally {
		submitting = false;
	}
}

function skipSecondDraft() {
	if (!snapshot) return;
	persist({ ...snapshot, secondDraft: { ...snapshot.secondDraft, skipped: true, commentary: null, providerError: null, unresolvedOrdinals: [] } });
}

async function enterTransfer() {
	if (!snapshot || !data.attempt.evaluatedAt) return;
	const form = new FormData();
	form.set("evaluatedAt", data.attempt.evaluatedAt);
	const result = await postAction("enterTransfer", form);
	if (result.type === "success") await invalidateAll();
}

function transferFixtures(): TransferNoteFixture[] {
	if (!snapshot) return [];
	return snapshot.transfer.queue.flatMap((entry) => {
		const note = data.practiceNotes.find((item) => item.id === entry.noteId);
		const example = note?.examples[entry.exampleIndex];
		return note && example
			? [
					{
						id: note.id,
						vocab: note.vocab,
						targetDefinition: note.targetDefinition,
						nativeDefinition: note.nativeDefinition,
						queueKind: entry.queueKind,
						examples: [example],
					},
				]
			: [];
	});
}

async function rateTransfer(rating: 1 | 3) {
	if (!snapshot || snapshot.transfer.queue.length === 0) return false;
	const active = snapshot.transfer.queue[0];
	const activeNote = data.practiceNotes.find((item) => item.id === active.noteId);
	if (!activeNote) {
		practiceError = "This vocabulary note is no longer available. Reload to continue.";
		return false;
	}
	practiceError = null;
	const form = new FormData();
	form.set("noteId", String(active.noteId));
	form.set("rating", String(rating));
	form.set("elapsedSeconds", String(Math.max(0, Math.round((Date.now() - transferStartedAt) / 1000))));
	const result = await postAction("rateTransfer", form);
	if (result.type !== "success") {
		practiceError = typeof result.data?.error === "string" ? result.data.error : "Rating failed.";
		return false;
	}

	const queue = advanceTranslationTransferQueue(
		snapshot.transfer.queue,
		rating === 1 ? "incorrect" : "pass",
		rating === 1 ? randomExampleIndex(activeNote.examples) : undefined,
	);
	const nextSnapshot = { ...snapshot, transfer: { ...snapshot.transfer, queue } };
	persist(nextSnapshot);
	transferStartedAt = Date.now();
	if (queue.length === 0) await completeTransfer();
	return true;
}

async function completeTransfer() {
	if (completingTransfer) return;
	completingTransfer = true;
	try {
		const result = await postAction("completeTransfer");
		if (result.type !== "success") return;
		clearTranslationFeedbackSnapshot(data.attempt.id);
		await invalidateAll();
	} finally {
		completingTransfer = false;
	}
}

function updateCardInput(index: number, value: string) {
	if (!snapshot) return;
	const cards = [...snapshot.cards];
	cards[index] = { ...cards[index], input: value };
	persist({ ...snapshot, cards });
}
</script>

<svelte:head><title>{data.template.title} · Evaluation</title></svelte:head>

{#if data.attempt.workflowPhase === "submitted"}
	<EvaluationWaiting
		title={t(lang, "eval.waiting.evaluating")}
		failed={evaluationFailed}
		retryLabel={t(lang, "common.retry")}
		failedBody={t(lang, "eval.waiting.failedBody")}
		onretry={() => void runEvaluation()}
	/>
{:else if data.attempt.workflowPhase === "correction" && data.evaluation && snapshot}
	{#if snapshot.correctionStep === "overview"}
		<EvaluationOverview
			evaluation={data.evaluation}
			title={t(lang, "eval.overview.title")}
			subtitle={t(lang, "eval.overview.subtitle")}
			{ratingLabels}
			continueLabel={t(lang, "eval.overview.continue")}
			regenerateLabel={regenerating ? t(lang, "eval.waiting.evaluating") : t(lang, "eval.overview.regenerate")}
			yourDraftLabel={t(lang, "eval.overview.yourDraft")}
			overallLabel={t(lang, "eval.overview.overall")}
			warningTitle={t(lang, "eval.overview.warningTitle")}
			warningBody={t(lang, "eval.overview.warningBody")}
			showRegenerate={data.evaluation.cards.some((card) => card.warnings.length > 0)}
			oncontinue={() => void continueOverview()}
			onregenerate={() => void regenerate()}
		/>
	{:else if data.evaluation.cards[snapshot.currentCardIndex]}
		{@const index = snapshot.currentCardIndex}
		<CorrectionCard
			card={data.evaluation.cards[index]}
			local={snapshot.cards[index]}
			cardIndex={index}
			cardTotal={data.evaluation.cards.length}
			titleLabel={t(lang, "eval.card.title")}
			eyebrowLabel={t(lang, "eval.card.stage")}
			sourceLabel={t(lang, "eval.card.source")}
			originalLabel={t(lang, "eval.card.original")}
			reviseLabel={t(lang, "eval.card.revise")}
			hintLabel={t(lang, "eval.card.hint")}
			deeperHintLabel={t(lang, "eval.card.deeperHint")}
			inputPlaceholder={t(lang, "eval.card.placeholder")}
			continueLabel={submitting ? t(lang, "eval.card.verifying") : t(lang, "eval.card.continue")}
			retryLabel={t(lang, "common.retry")}
			providerErrorTitle={t(lang, "eval.card.providerErrorTitle")}
			providerErrorBody={t(lang, "eval.card.providerErrorBody")}
			nextAriaLabel={t(lang, "eval.card.nextAria")}
			yourDiffLabel={t(lang, "eval.card.yourDiff")}
			minimalDiffLabel={t(lang, "eval.card.minimalDiff")}
			referenceLabel={t(lang, "eval.card.reference")}
			feedbackLabel={t(lang, "eval.card.feedback")}
			teacherNotesLabel={t(lang, "eval.card.teacherNotes")}
			{submitting}
			oninput={(value) => updateCardInput(index, value)}
			onsubmit={(value) => void verifyCard(value)}
			onnext={() => void nextCard()}
		/>
	{/if}
{:else if data.attempt.workflowPhase === "second_draft" && data.evaluation && snapshot}
	<SecondDraft
		sourceParagraphs={data.evaluation.sourceParagraphs}
		draft={snapshot.secondDraft}
		{practiceStatus}
		title={t(lang, "eval.secondDraft.title")}
		sourceLabel={t(lang, "eval.secondDraft.source")}
		yourDraftLabel={t(lang, "eval.secondDraft.yourDraft")}
		submitLabel={submitting ? t(lang, "eval.card.verifying") : t(lang, "eval.secondDraft.submit")}
		skipLabel={t(lang, "eval.secondDraft.skip")}
		skipConfirmTitle={t(lang, "eval.secondDraft.skipConfirmTitle")}
		skipConfirmBody={t(lang, "eval.secondDraft.skipConfirmBody")}
		skipConfirmAction={t(lang, "eval.secondDraft.skipConfirmAction")}
		waitingPracticeLabel={t(lang, "eval.secondDraft.waitingPractice")}
		generatingLabel={t(lang, "eval.practice.generating")}
		failedLabel={t(lang, "eval.practice.failed")}
		readyLabel={t(lang, "eval.practice.ready")}
		retryLabel={t(lang, "common.retry")}
		cancelLabel={t(lang, "common.cancel")}
		continueLabel={t(lang, "eval.overview.continue")}
		feedbackLabel={t(lang, "eval.card.feedback")}
		providerErrorBody={snapshot.secondDraft.providerError}
		{submitting}
		onupdate={(index, value) => {
				if (!snapshot) return;
				const paragraphs = [...snapshot.secondDraft.paragraphs];
				paragraphs[index] = value;
				persist({ ...snapshot, secondDraft: { ...snapshot.secondDraft, paragraphs } });
			}}
		onsubmit={() => void submitSecondDraft()}
		onskip={skipSecondDraft}
		oncontinue={() => void enterTransfer()}
		onretryPractice={() => { practiceStatus = "idle"; practiceError = null; }}
	/>
{:else if data.attempt.workflowPhase === "transfer"}
	{#if practiceStatus === "ready" && snapshot && snapshot.transfer.initialized && snapshot.transfer.queue.length > 0}
		{#if practiceError}
			<p class="mx-auto mb-5 max-w-3xl text-sm text-destructive" role="alert">{practiceError}</p>
		{/if}
		<TransferPractice
			notes={transferFixtures()}
			currentIndex={0}
			title={t(lang, "eval.transfer.title")}
			stageLabel={t(lang, "eval.transfer.stage")}
			revealLabel={t(lang, "eval.transfer.reveal")}
			incorrectLabel={t(lang, "eval.transfer.incorrect")}
			passLabel={t(lang, "eval.transfer.pass")}
			countLabels={reviewCountLabels}
			onincorrect={() => rateTransfer(1)}
			onpass={() => rateTransfer(3)}
		/>
	{:else}
		<EvaluationWaiting
			title={practiceStatus === "failed" ? t(lang, "eval.practice.failed") : t(lang, "eval.practice.generating")}
			failed={practiceStatus === "failed"}
			failedBody={practiceError ?? t(lang, "eval.waiting.failedBody")}
			retryLabel={t(lang, "common.retry")}
			onretry={() => { practiceStatus = "idle"; practiceError = null; }}
		/>
	{/if}
{:else if data.attempt.workflowPhase === "completed"}
	<section class="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center text-center" aria-live="polite">
		<CheckCircle2 class="mb-7 size-12 text-[#55705b]" strokeWidth={1.25} />
		<p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{t(lang, "eval.complete.eyebrow")}</p>
		<h1 tabindex="-1" class="font-serif text-4xl tracking-tight focus:outline-none">{t(lang, "eval.complete.title")}</h1>
		<p class="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">{t(lang, "eval.complete.body")}</p>
		<Button href="/translate" size="icon" class="mt-8 size-12 rounded-full" aria-label={t(lang, "eval.complete.homeAria")}><Home /></Button>
	</section>
{:else}
	<EvaluationWaiting title="Preparing the next stage" />
{/if}
