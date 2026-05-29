<script lang="ts">
import { CARD_TYPE_LABELS, type CardType } from "$lib/constants";

interface Props {
	front: string;
	back: string;
	context: string | null;
	cardType: CardType;
	flipped: boolean;
}

let { front, back, context, cardType, flipped }: Props = $props();
</script>

<div class="flashcard cursor-pointer select-none" class:flipped>
	<div class="flashcard-inner relative w-full h-full">
		<div
			class="flashcard-face flashcard-front absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 shadow-sm"
		>
			<span class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">{CARD_TYPE_LABELS[cardType]}</span>
			<p class="text-center text-2xl leading-relaxed text-foreground">{front}</p>
			{#if !flipped}
				<p class="mt-6 text-sm text-muted-foreground">Tap or press Space to reveal</p>
			{/if}
		</div>
		<div
			class="flashcard-face flashcard-back absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 shadow-sm"
		>
			<p class="text-center text-xl leading-relaxed text-foreground">{back}</p>
			{#if context}
				<div class="mt-4 rounded-lg border border-border bg-muted/50 px-4 py-3">
					<p class="text-base italic text-muted-foreground">{context}</p>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
.flashcard {
	perspective: 800px;
	width: 100%;
	max-width: 480px;
	height: 320px;
	margin: 0 auto;
}
.flashcard-inner {
	transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
	transform-style: preserve-3d;
}
.flashcard.flipped .flashcard-inner {
	transform: rotateY(180deg);
}
.flashcard-face {
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
}
.flashcard-back {
	transform: rotateY(180deg);
}
</style>
