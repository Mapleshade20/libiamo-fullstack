<script lang="ts">
import StudyCard from "$lib/components/review/StudyCard.svelte";
import type { StudyCardAction } from "$lib/components/review/study-card";
import { countStudyQueue } from "$lib/review";
import type { TransferNoteFixture } from "./types";

interface Props {
	notes: TransferNoteFixture[];
	/** Current note index in the local queue. */
	currentIndex: number;
	title: string;
	/** Stage eyebrow, default Stage 3. */
	stageLabel?: string;
	revealLabel: string;
	incorrectLabel: string;
	passLabel: string;
	countLabels: { new: string; learning: string; review: string };
	onincorrect?: () => boolean | undefined | Promise<boolean | undefined>;
	onpass?: () => boolean | undefined | Promise<boolean | undefined>;
}

let {
	notes,
	currentIndex,
	title,
	stageLabel = "Stage 3",
	revealLabel,
	incorrectLabel,
	passLabel,
	countLabels,
	onincorrect,
	onpass,
}: Props = $props();

let revealed = $state(false);
let ratingBusy = $state(false);

const note = $derived(notes[currentIndex] ?? null);
const example = $derived(note?.examples[0] ?? null);
const counts = $derived(countStudyQueue(notes));
const actions = $derived([
	{ id: "incorrect", label: incorrectLabel, shortcut: "1", tone: "again" },
	{ id: "pass", label: passLabel, shortcut: "2", tone: "good" },
] satisfies StudyCardAction[]);

$effect(() => {
	note?.id;
	example?.nativeText;
	example?.targetText;
	revealed = false;
	ratingBusy = false;
});

async function rate(kind: "incorrect" | "pass") {
	if (ratingBusy || !revealed) return;
	ratingBusy = true;
	try {
		if (kind === "incorrect") await onincorrect?.();
		else await onpass?.();
	} finally {
		ratingBusy = false;
	}
}
</script>

<section class="mx-auto w-full max-w-4xl">
	<header class="mb-6 flex items-end justify-between gap-3 border-b border-stone-400/25 pb-5 sm:mb-8">
		<div class="min-w-0">
			<p class="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">{stageLabel}</p>
			<h1 class="font-serif text-3xl leading-tight tracking-tight focus:outline-none" tabindex="-1">{title}</h1>
		</div>
	</header>

	{#if note && example}
		{#key `${note.id}:${example.nativeText}:${example.targetText}`}
			<StudyCard
				vocab={note.vocab}
				nativeDefinition={note.nativeDefinition}
				nativeText={example.nativeText}
				targetText={example.targetText}
				{revealed}
				showAnswerLabel={revealLabel}
				{counts}
				{countLabels}
				{actions}
				disabled={ratingBusy}
				onreveal={() => { revealed = true; }}
				onaction={(id) => { if (id === "incorrect" || id === "pass") void rate(id); }}
			/>
		{/key}
	{/if}
</section>
