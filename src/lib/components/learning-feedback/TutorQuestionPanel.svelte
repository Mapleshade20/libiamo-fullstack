<script lang="ts">
import BookmarkPlus from "@lucide/svelte/icons/bookmark-plus";
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import Send from "@lucide/svelte/icons/send";
import X from "@lucide/svelte/icons/x";
import { tick } from "svelte";
import { fly, scale } from "svelte/transition";
import { Button } from "$lib/components/ui/button";
import { Skeleton } from "$lib/components/ui/skeleton";
import { renderMarkdown } from "$lib/markdown";
import type { LearningSelection, SelectionAppendRequest } from "./types";

let {
	appendRequest = null,
	defaultSelection,
	onAsk,
	onSaveQa,
}: {
	appendRequest?: SelectionAppendRequest | null;
	defaultSelection: LearningSelection;
	onAsk: (input: LearningSelection & { question: string }) => Promise<string>;
	onSaveQa: (input: LearningSelection & { question: string; answer: string }) => Promise<void>;
} = $props();

let isExpanded = $state(false);
let selection = $state<LearningSelection | null>(null);
let question = $state("");
let answer = $state<string | null>(null);
let isLoading = $state(false);
let isSaving = $state(false);
let saved = $state(false);
let error = $state<string | null>(null);
let textareaElement = $state<HTMLTextAreaElement | null>(null);
let lastAppendRequestId = $state<number | null>(null);

$effect(() => {
	if (!appendRequest || appendRequest.id === lastAppendRequestId) return;
	lastAppendRequestId = appendRequest.id;
	selection = appendRequest.selection;
	isExpanded = true;
	question = "";
	answer = null;
	saved = false;
	error = null;
	void tick().then(() => textareaElement?.focus());
});

function reset() {
	question = "";
	answer = null;
	selection = null;
	saved = false;
	error = null;
}

function toggleExpanded() {
	isExpanded = !isExpanded;
	if (!isExpanded) reset();
}

async function handleSubmit() {
	if (!question.trim() || isLoading) return;
	isLoading = true;
	error = null;
	answer = null;
	try {
		answer = await onAsk({ ...(selection ?? defaultSelection), question: question.trim() });
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "The Tutor request failed.";
	} finally {
		isLoading = false;
	}
}

async function handleSave() {
	if (!answer || isSaving) return;
	isSaving = true;
	error = null;
	try {
		await onSaveQa({ ...(selection ?? defaultSelection), question, answer });
		saved = true;
	} catch (cause) {
		error = cause instanceof Error ? cause.message : "Failed to save note.";
	} finally {
		isSaving = false;
	}
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		void handleSubmit();
	}
}
</script>

{#if !isExpanded}
	<button
		type="button"
		data-selection-ignore
		class="fixed right-4 bottom-4 z-30 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 sm:right-8 sm:bottom-8"
		onclick={toggleExpanded}
		transition:scale={{ duration: 180 }}
		aria-label="Ask the Tutor"
		title="Ask the Tutor"
	>
		<MessageCircleQuestion size={23} />
	</button>
{:else}
	<div
		data-selection-ignore
		class="fixed right-4 bottom-4 left-4 z-30 overflow-hidden rounded-lg border border-border bg-background/95 shadow-2xl backdrop-blur-md sm:right-8 sm:bottom-8 sm:left-auto sm:w-[400px]"
		transition:fly={{ y: 20, duration: 220 }}
	>
		<div class="flex items-center justify-between border-b border-border p-4">
			<div class="flex items-center gap-2"><MessageCircleQuestion size={19} /><span class="font-medium">Ask the Tutor</span></div>
			<button type="button" class="rounded p-1 text-muted-foreground hover:bg-muted" onclick={toggleExpanded} aria-label="Close">
				<X size={18} />
			</button>
		</div>
		<div class="max-h-[min(420px,55dvh)] overflow-y-auto p-4">
			{#if selection}
				<blockquote class="mb-4 border-l-2 border-border pl-3 text-sm text-muted-foreground">{selection.text}</blockquote>
			{/if}
			{#if answer || isLoading}
				<div class="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm">{question}</div>
				<div class="rounded-md border border-border p-4">
					{#if isLoading}
						<div class="space-y-2"><Skeleton class="h-4 w-full" /><Skeleton class="h-4 w-5/6" /><Skeleton class="h-4 w-2/3" /></div>
					{:else if answer}
						<div class="prose prose-sm max-w-none">{@html renderMarkdown(answer)}</div>
					{/if}
				</div>
				{#if answer}
					<div class="mt-3 flex gap-2">
						<Button size="sm" variant="outline" class="flex-1" onclick={handleSave} disabled={isSaving || saved}
							><BookmarkPlus size={14} />{saved ? "Saved" : isSaving ? "Saving..." : "Save Q&A"}</Button
						>
						<Button size="sm" variant="ghost" class="flex-1" onclick={reset}>Ask another</Button>
					</div>
				{/if}
			{:else}
				<p class="text-sm text-muted-foreground">Ask about the selected language or the feedback on this page.</p>
			{/if}
			{#if error}
				<p class="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
			{/if}
		</div>
		{#if !answer && !isLoading}
			<div class="border-t border-border p-4">
				<div class="flex items-end gap-2">
					<textarea
						bind:this={textareaElement}
						bind:value={question}
						onkeydown={handleKeydown}
						placeholder="Type your question..."
						class="min-w-0 flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
						rows="2"
					></textarea>
					<Button size="icon" onclick={handleSubmit} disabled={!question.trim() || isLoading} aria-label="Send question" title="Send question"
						><Send size={16} /></Button
					>
				</div>
			</div>
		{/if}
	</div>
{/if}
