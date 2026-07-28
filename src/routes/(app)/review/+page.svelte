<script lang="ts">
import { untrack } from "svelte";
import ReviewSessionSummary from "$lib/components/review/ReviewSessionSummary.svelte";
import StudyCard from "$lib/components/review/StudyCard.svelte";
import type { StudyCardAction } from "$lib/components/review/study-card";
import { Skeleton } from "$lib/components/ui/skeleton";
import { type LanguageCode, t } from "$lib/i18n";
import { advanceReviewQueue, countStudyQueue, type StudyQueueKind } from "$lib/review";

let { data } = $props();
let lang: LanguageCode = $derived(data.user.activeLanguage as LanguageCode);
let queue = $state(untrack(() => [...data.cards]));
let revealed = $state(false);
let isSubmitting = $state(false);
let cardsReviewed = $state(0);
let sessionStart = $state(0);
let cardRevealedAt = $state(0);
let sessionComplete = $state(false);
let error = $state<string | null>(null);

let currentCard = $derived(queue[0] ?? null);
let counts = $derived(countStudyQueue(queue));
let countLabels = $derived({
	new: t(lang, "review.count.new"),
	learning: t(lang, "review.count.learning"),
	review: t(lang, "review.count.review"),
});
let actions = $derived(
	currentCard
		? ([
				{ id: "1", rating: 1, label: t(lang, "review.rating.again"), detail: currentCard.previewIntervals.again, shortcut: "1", tone: "again" },
				{ id: "2", rating: 2, label: t(lang, "review.rating.hard"), detail: currentCard.previewIntervals.hard, shortcut: "2", tone: "hard" },
				{ id: "3", rating: 3, label: t(lang, "review.rating.good"), detail: currentCard.previewIntervals.good, shortcut: "3", tone: "good" },
				{ id: "4", rating: 4, label: t(lang, "review.rating.easy"), detail: currentCard.previewIntervals.easy, shortcut: "4", tone: "easy" },
			] satisfies Array<StudyCardAction & { rating: number }>)
		: [],
);

function reveal() {
	if (isSubmitting) return;
	if (sessionStart === 0) sessionStart = Date.now();
	if (cardRevealedAt === 0) cardRevealedAt = Date.now();
	revealed = true;
}

type ReviewRateResult = {
	queueKind: StudyQueueKind;
	previewIntervals: { again: string; hard: string; good: string; easy: string };
	nativeText: string;
	targetText: string;
};

function isReviewRateResult(value: unknown): value is ReviewRateResult {
	if (!value || typeof value !== "object") return false;
	const result = value as Record<string, unknown>;
	const intervals = result.previewIntervals as Record<string, unknown> | undefined;
	return (
		["new", "learning", "review"].includes(String(result.queueKind)) &&
		typeof result.nativeText === "string" &&
		typeof result.targetText === "string" &&
		!!intervals &&
		["again", "hard", "good", "easy"].every((key) => typeof intervals[key] === "string")
	);
}

async function rate(rating: number) {
	if (isSubmitting || !currentCard) return;
	const ratedCard = currentCard;
	isSubmitting = true;

	try {
		const res = await fetch(`/api/review/${currentCard.id}/rate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ rating, elapsedSeconds: Math.round((Date.now() - cardRevealedAt) / 1000) }),
		});

		if (!res.ok) throw new Error("Failed to submit rating");
		const result: unknown = await res.json();
		if (!isReviewRateResult(result)) throw new Error("Invalid review response");

		cardsReviewed++;
		queue = advanceReviewQueue(queue, {
			...ratedCard,
			queueKind: result.queueKind,
			previewIntervals: result.previewIntervals,
			nativeText: result.nativeText,
			targetText: result.targetText,
		});
		sessionComplete = queue.length === 0;
		revealed = false;
		cardRevealedAt = 0;
	} catch (e) {
		error = e instanceof Error ? e.message : "Something went wrong";
	} finally {
		isSubmitting = false;
	}
}
</script>

<svelte:head>
	<title>Review · Libiamo</title>
	<meta name="description" content="Review vocabulary, grammar, expressions, and corrections with spaced repetition.">
</svelte:head>

<div class="mx-auto max-w-4xl">
	<h1 class="mb-6 text-center font-serif text-3xl sm:mb-8">{t(lang, "review.title")}</h1>

	{#if error}
		<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-base text-red-700">
			{error}
			<button type="button" class="ml-2 underline" onclick={() => { error = null; }}>{t(lang, "common.retry")}</button>
		</div>
	{:else if sessionComplete}
		<ReviewSessionSummary {cardsReviewed} timeSpentSeconds={Math.round((Date.now() - sessionStart) / 1000)} {lang} />
	{:else if data.cards.length === 0}
		<div class="flex flex-col items-center gap-4 py-12">
			<p class="text-xl text-muted-foreground">{t(lang, "review.empty")}</p>
			<p class="text-base text-muted-foreground">{t(lang, "review.emptyHint")}</p>
			<a href="/" class="text-base text-muted-foreground underline hover:text-foreground">{t(lang, "review.summary.backToHall")}</a>
		</div>
	{:else if currentCard}
		<StudyCard
			vocab={currentCard.vocab}
			nativeDefinition={currentCard.nativeDefinition}
			nativeText={currentCard.nativeText}
			targetText={currentCard.targetText}
			{revealed}
			showAnswerLabel={t(lang, "review.showAnswer")}
			{counts}
			{countLabels}
			{actions}
			disabled={isSubmitting}
			onreveal={reveal}
			onaction={(id) => {
				const action = actions.find((item) => item.id === id);
				if (action) void rate(action.rating);
			}}
		/>
	{:else}
		<div class="space-y-4">
			<Skeleton class="mx-auto h-80 w-full max-w-md rounded-2xl" />
			<Skeleton class="mx-auto h-10 w-64" />
		</div>
	{/if}

	<div class="border-t border-border pt-6 text-center">
		<a href="/archive" class="text-muted-foreground underline hover:text-foreground">Manage learning notes</a>
	</div>
</div>
