<script lang="ts">
import { CARD_TYPE_LABELS, type CardType } from "$lib/constants";

interface Props {
	front: string;
	back: string;
	cardType: CardType;
	flipped: boolean;
}

let { front, back, cardType, flipped }: Props = $props();
</script>

<div class="flashcard cursor-pointer select-none" class:flipped>
	<div class="flashcard-inner relative w-full h-full">
		<div
			class="flashcard-face flashcard-front absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 shadow-sm"
		>
			<span class="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">{CARD_TYPE_LABELS[cardType]}</span>
			<div class="card-content flex-1 flex items-center justify-center w-full overflow-y-auto">
				<p class="card-text card-text-front text-center leading-snug text-foreground">{front}</p>
			</div>
			{#if !flipped}
				<p class="mt-2 text-xs text-muted-foreground">Tap or press Space to reveal</p>
			{/if}
		</div>
		<div
			class="flashcard-face flashcard-back absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 shadow-sm"
		>
			<div class="card-content flex-1 flex items-center justify-center w-full overflow-y-auto">
				<p class="card-text card-text-back text-center leading-snug text-foreground whitespace-pre-line">{back}</p>
			</div>
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
	container-type: inline-size;
}
.flashcard-inner {
	transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
	transform-style: preserve-3d;
	height: 100%;
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
.card-content {
	container-type: inline-size;
}
.card-text-front {
	font-size: clamp(0.875rem, 8cqi, 2rem);
}
.card-text-back {
	font-size: clamp(0.75rem, 6cqi, 1.5rem);
}
</style>
