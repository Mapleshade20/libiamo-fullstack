<script lang="ts">
import { Button } from "$lib/components/ui/button";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { randomExampleIndex } from "$lib/review/note";
import type { StudyQueueKind } from "$lib/review/queue";
import { advanceTransferQueue, type TransferQueueState, transferQueueNotes } from "$lib/review/transfer-queue";
import TransferStage from "./TransferStage.svelte";

/**
 * The post-task card pass, shared by translation and practice evaluation pages.
 *
 * It owns the queue lifecycle — building it from the loaded notes, rating, advancing, and finishing
 * once it drains — while the page owns where the queue is persisted and which endpoints it talks
 * to. The page decides when the stage is shown; this component never navigates.
 */

type PassNote = {
	id: number;
	vocab: string;
	targetDefinition: string;
	nativeDefinition: string;
	queueKind: StudyQueueKind;
	examples: Array<{ targetText: string; nativeText: string }>;
};

interface Props {
	lang: LanguageCode;
	/** 1-based position of the pass among the page's stages. */
	stage: number;
	notes: PassNote[];
	pass: TransferQueueState;
	onchange: (next: TransferQueueState) => void;
	/** Persist one rating; throw an `Error` with a learner-facing message on failure. */
	submitRating: (input: { noteId: number; rating: 1 | 3; elapsedSeconds: number }) => Promise<void>;
	/** Finish the pass once the queue drains; throw on failure to offer a retry. */
	complete: () => Promise<void>;
}

let { lang, stage, notes, pass, onchange, submitRating, complete }: Props = $props();

let startedAt = Date.now();
let error = $state<string | null>(null);
let completing = $state(false);
let completionFailed = $state(false);
// Completion hands control back to the page, which swaps the stage out after its own reload.
let completed = false;

const queueNotes = $derived(transferQueueNotes(pass.queue, notes));
const countLabels = $derived({
	new: t(lang, "review.count.new"),
	learning: t(lang, "review.count.learning"),
	review: t(lang, "review.count.review"),
});

$effect(() => {
	if (pass.initialized) return;
	onchange({
		initialized: true,
		queue: notes.map((note) => ({ noteId: note.id, exampleIndex: randomExampleIndex(note.examples), queueKind: note.queueKind })),
	});
});

// A note deleted elsewhere (e.g. /review/manage) cannot be drilled; drop it rather than stall.
$effect(() => {
	if (!pass.initialized) return;
	const live = pass.queue.filter((entry) => notes.some((note) => note.id === entry.noteId && note.examples[entry.exampleIndex]));
	if (live.length !== pass.queue.length) onchange({ ...pass, queue: live });
});

$effect(() => {
	if (pass.initialized && pass.queue.length === 0 && !completing && !completionFailed && !completed) void finish();
});

async function rate(rating: 1 | 3) {
	const active = pass.queue[0];
	const note = active && notes.find((item) => item.id === active.noteId);
	if (!active || !note) return false;
	try {
		await submitRating({ noteId: active.noteId, rating, elapsedSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)) });
	} catch (cause) {
		error = cause instanceof Error && cause.message ? cause.message : t(lang, "common.error");
		return false;
	}
	error = null;
	startedAt = Date.now();
	const next = advanceTransferQueue(pass.queue, rating === 1 ? "incorrect" : "pass", rating === 1 ? randomExampleIndex(note.examples) : undefined);
	onchange({ ...pass, queue: next });
	return true;
}

async function finish() {
	completing = true;
	completionFailed = false;
	try {
		await complete();
		completed = true;
		error = null;
	} catch (cause) {
		completionFailed = true;
		error = cause instanceof Error && cause.message ? cause.message : t(lang, "common.error");
	} finally {
		completing = false;
	}
}
</script>

{#if error}
	<p class="mx-auto mb-5 max-w-4xl text-sm text-destructive" role="alert">{error}</p>
{/if}
{#if queueNotes.length > 0}
	<TransferStage
		notes={queueNotes}
		currentIndex={0}
		title={t(lang, "eval.transfer.title")}
		stageLabel={t(lang, "eval.stage").replace("{number}", String(stage))}
		revealLabel={t(lang, "eval.transfer.reveal")}
		incorrectLabel={t(lang, "eval.transfer.incorrect")}
		passLabel={t(lang, "eval.transfer.pass")}
		{countLabels}
		onincorrect={() => rate(1)}
		onpass={() => rate(3)}
	/>
{:else if completionFailed}
	<div class="mx-auto max-w-4xl text-center"><Button variant="outline" onclick={() => void finish()}>{t(lang, "common.retry")}</Button></div>
{/if}
