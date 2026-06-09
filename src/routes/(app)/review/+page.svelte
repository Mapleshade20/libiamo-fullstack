<script lang="ts">
import Flashcard from "$lib/components/review/Flashcard.svelte";
import RatingButtons from "$lib/components/review/RatingButtons.svelte";
import ReviewProgress from "$lib/components/review/ReviewProgress.svelte";
import ReviewSessionSummary from "$lib/components/review/ReviewSessionSummary.svelte";
import { Skeleton } from "$lib/components/ui/skeleton";
import { type LanguageCode, t } from "$lib/i18n";

let { data } = $props();
let lang: LanguageCode = $derived(data.user.activeLanguage as LanguageCode);
let currentIndex = $state(0);
let flipped = $state(false);
let isSubmitting = $state(false);
let cardsReviewed = $state(0);
let sessionStart = $state(0);
let cardRevealedAt = $state(0);
let sessionComplete = $state(false);
let error = $state<string | null>(null);

let currentCard = $derived(data.cards[currentIndex] ?? null);

function flip() {
	if (isSubmitting) return;
	if (sessionStart === 0) sessionStart = Date.now();
	if (cardRevealedAt === 0) cardRevealedAt = Date.now();
	flipped = true;
}

async function rate(rating: number) {
	if (isSubmitting || !currentCard) return;
	isSubmitting = true;

	try {
		const res = await fetch(`/api/review/${currentCard.id}/rate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ rating, elapsedSeconds: Math.round((Date.now() - cardRevealedAt) / 1000) }),
		});

		if (!res.ok) throw new Error("Failed to submit rating");

		cardsReviewed++;

		if (currentIndex + 1 >= data.cards.length) {
			sessionComplete = true;
		} else {
			currentIndex++;
			flipped = false;
			cardRevealedAt = Date.now();
		}
	} catch (e) {
		error = e instanceof Error ? e.message : "Something went wrong";
	} finally {
		isSubmitting = false;
	}
}

function handleKeydown(e: KeyboardEvent) {
	if (sessionComplete) return;

	if (!flipped && (e.key === " " || e.key === "Enter")) {
		e.preventDefault();
		flip();
		return;
	}

	if (flipped && !isSubmitting) {
		if (e.key === "1") rate(1);
		else if (e.key === "2") rate(2);
		else if (e.key === "3") rate(3);
		else if (e.key === "4") rate(4);
	}
}
</script>

<svelte:head>
	<title>Review · Libiamo</title>
	<meta name="description" content="Review vocabulary, grammar, expressions, and corrections with spaced repetition.">
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="mx-auto max-w-xl pb-24 sm:pb-0">
	<h1 class="mb-8 text-center text-3xl">{t(lang, "review.title")}</h1>

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
		<ReviewProgress current={currentIndex + 1} total={data.cards.length} {lang} />

		<div onclick={flip} onkeydown={(e) => { if (e.key === "Enter") flip(); }} role="button" tabindex="0">
			<Flashcard front={currentCard.front} back={currentCard.back} cardType={currentCard.cardType} {flipped} />
		</div>

		{#if flipped}
			<RatingButtons preview={currentCard.previewIntervals} {lang} disabled={isSubmitting} onrate={rate} />
		{/if}
	{:else}
		<div class="space-y-4">
			<Skeleton class="mx-auto h-80 w-full max-w-md rounded-2xl" />
			<Skeleton class="mx-auto h-10 w-64" />
		</div>
	{/if}

	{#if data.cardCount > 0}
		<div class="mt-12 border-t border-border pt-6 text-center">
			<a href="/review/cards" class="text-muted-foreground underline hover:text-foreground"> Manage cards ({data.cardCount}) </a>
		</div>
	{/if}
</div>
