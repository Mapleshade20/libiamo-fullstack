<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import Check from "@lucide/svelte/icons/check";
import X from "@lucide/svelte/icons/x";
import { fade, slide } from "svelte/transition";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";
import type { TransferNoteFixture } from "./types";

interface Props {
	notes: TransferNoteFixture[];
	/** Current note index in local queue. */
	currentIndex: number;
	title: string;
	/** Stage eyebrow, default Stage 3. */
	stageLabel?: string;
	patternLabel?: string;
	yourAnswerLabel?: string;
	/** Label above the revealed model answer (same style as yourAnswerLabel). */
	answerLabel?: string;
	answerPlaceholder: string;
	revealLabel: string;
	incorrectLabel: string;
	passLabel: string;
	deferredLabel: string;
	onincorrect?: () => void;
	onpass?: () => void;
	/** Called when the last note is rated — parent should leave transfer for the overall complete page. */
	onfinish?: () => void;
}

let {
	notes,
	currentIndex,
	title,
	stageLabel = "Stage 3",
	patternLabel = "Pattern",
	yourAnswerLabel = "Your translation",
	answerLabel = "Answer",
	answerPlaceholder,
	revealLabel,
	incorrectLabel,
	passLabel,
	deferredLabel,
	onincorrect,
	onpass,
	onfinish,
}: Props = $props();

let typed = $state("");
let revealed = $state(false);
let ratingBusy = $state(false);
let deferredNotice = $state(false);

const note = $derived(notes[currentIndex] ?? null);
const exercise = $derived(note?.exercises[0] ?? null);

$effect(() => {
	currentIndex;
	typed = "";
	revealed = false;
	ratingBusy = false;
	deferredNotice = false;
});

function reveal() {
	if (!typed.trim()) return;
	revealed = true;
}

function rate(kind: "incorrect" | "pass") {
	if (ratingBusy || !revealed) return;
	ratingBusy = true;
	const isLast = currentIndex >= notes.length - 1;
	if (kind === "incorrect") {
		deferredNotice = true;
		onincorrect?.();
	} else {
		onpass?.();
	}
	if (isLast) {
		onfinish?.();
	}
	ratingBusy = false;
}
</script>

<section class="mx-auto w-full max-w-3xl">
	<!-- Title rule under Stage 3 / Apply the pattern. -->
	<header class="mb-0 flex items-end justify-between gap-3 border-b border-stone-400/25 pb-5">
		<div class="min-w-0">
			<p class="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">{stageLabel}</p>
			<h1 class="font-serif text-3xl leading-tight tracking-tight focus:outline-none" tabindex="-1">{title}</h1>
		</div>
		{#if note}
			<p class="shrink-0 text-xs text-muted-foreground">{currentIndex + 1} / {notes.length}</p>
		{/if}
	</header>

	{#if note && exercise}
		{#key note.id}
			<div in:fade={{ duration: 240 }}>
				<!-- Stem: bottom rule only (no top rule — that would double the header line). -->
				<div class="border-b border-stone-400/25 py-5 text-center">
					<p class="font-serif text-xl leading-relaxed">{exercise.front}</p>
				</div>

				<div class="mt-5">
					<label for="transfer-answer" class="mb-3 block text-sm font-semibold">{yourAnswerLabel}</label>
					<Textarea
						id="transfer-answer"
						bind:value={typed}
						rows={3}
						readonly={revealed}
						placeholder={answerPlaceholder}
						class="min-h-24 resize-y rounded-md bg-card/75 text-base leading-relaxed"
						oninput={() => {
							if (revealed) return;
						}}
					/>
				</div>

				{#if revealed}
					<div class="mt-5 space-y-4" transition:slide={{ duration: 280 }}>
						<div in:fade={{ duration: 220 }}>
							<p class="mb-3 text-sm font-semibold">{answerLabel}</p>
							<div class="rounded-md border border-border bg-card/75 px-2.5 py-2 text-base leading-relaxed shadow-xs">{exercise.back}</div>
						</div>
						<div class="border-l-2 border-[#8fa3b1] bg-card/60 px-4 py-4" in:fade={{ duration: 240, delay: 40 }}>
							<p class="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{patternLabel}</p>
							<p class="font-sans text-sm leading-relaxed text-foreground/90">{note.targetPattern}</p>
						</div>
						{#if deferredNotice}
							<p class="text-sm text-muted-foreground" role="status" in:fade={{ duration: 200 }}>{deferredLabel}</p>
						{/if}
					</div>
				{/if}

				<footer class="mt-5">
					{#if !revealed}
						<div class="flex justify-end">
							<Button disabled={!typed.trim()} onclick={reveal}>{revealLabel}<ArrowRight /></Button>
						</div>
					{:else}
						<div class="grid grid-cols-2 gap-3" in:fade={{ duration: 200, delay: 80 }}>
							<Button variant="outline" class="h-11" disabled={ratingBusy} onclick={() => rate("incorrect")}> <X />{incorrectLabel} </Button>
							<Button class="h-11" disabled={ratingBusy} onclick={() => rate("pass")}> <Check />{passLabel} </Button>
						</div>
					{/if}
				</footer>
			</div>
		{/key}
	{/if}
</section>
