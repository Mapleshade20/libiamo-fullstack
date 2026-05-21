<script lang="ts">
import Loader from "@lucide/svelte/icons/loader-circle";
import Send from "@lucide/svelte/icons/send";
import { renderMarkdown } from "$lib/markdown";

type EvalHighlight = { key: string; type: "good" | "bad"; feedback: string; grammarNote?: string; explanation?: string };

interface Props {
	sentence: string;
	sentenceKey: string;
	translation: string;
	highlight?: EvalHighlight;
	isAnnotated: boolean;
	isShort: boolean;
	mode: "preview" | "editing" | "submitted";
	isActive: boolean;
	reference?: string;
	loadingReference: boolean;
	onShowReference: () => void;
	tutorAnswer?: string;
	loadingTutorAnswer: boolean;
	tutorError: string;
	onAskTutor: (question: string) => void;
	onToggle: () => void;
	onBlur: () => void;
	onTranslationChange: (value: string) => void;
}

let {
	sentence,
	sentenceKey: _key,
	translation,
	highlight,
	isAnnotated,
	isShort,
	mode,
	isActive,
	reference,
	loadingReference,
	onShowReference,
	tutorAnswer,
	loadingTutorAnswer,
	tutorError,
	onAskTutor,
	onToggle,
	onBlur,
	onTranslationChange,
}: Props = $props();

let showAskBubble = $state(false);
let askQuestion = $state("");

function handleAsk() {
	const q = askQuestion.trim();
	if (!q) return;
	onAskTutor(q);
	askQuestion = "";
}
</script>

<div>
	<!-- Source sentence row -->
	{#if mode === "editing"}
		<div
			role="button"
			tabindex={isShort ? -1 : 0}
			onclick={() => { if (!isShort) onToggle(); }}
			onkeydown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !isShort) { e.preventDefault(); onToggle(); } }}
			class="w-full text-left rounded-lg px-3 py-2 transition-colors flex items-center gap-2
			{isShort ? 'cursor-default' : 'cursor-pointer'}
			{translation && !isShort ? 'bg-foreground/5' : ''}
			{isActive && !isShort ? 'ring-1 ring-foreground/20' : ''}"
		>
			<span class="text-base font-light leading-relaxed text-foreground flex-1">{sentence}</span>
			{#if isShort}
				<span class="text-[10px] font-medium text-muted-foreground bg-foreground/5 px-1.5 py-0.5 rounded shrink-0">Skipped</span>
			{/if}
		</div>
	{:else}
		<p class="text-base font-light leading-relaxed text-foreground flex items-center gap-2">
			{sentence}
			{#if isShort}
				<span class="text-[10px] font-medium text-muted-foreground bg-foreground/5 px-1.5 py-0.5 rounded">Skipped</span>
			{/if}
		</p>
	{/if}

	<!-- Translation input (editing mode) -->
	{#if mode === "editing" && isActive && !isShort}
		<div class="mt-1 ml-4 pl-3 border-l-2 border-foreground/20">
			<textarea
				class="w-full min-h-[60px] resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30"
				placeholder="Enter your translation..."
				value={translation}
				oninput={(e) => onTranslationChange((e.target as HTMLTextAreaElement).value)}
				onblur={onBlur}
				rows={2}
			></textarea>
		</div>
	{:else if mode === "editing" && isActive && isShort}
		<div class="mt-1 ml-4 pl-3 border-l-2 border-foreground/10">
			<textarea
				class="w-full min-h-[40px] resize-y rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-sm text-muted-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/20"
				placeholder="Optional — excluded from evaluation"
				value={translation}
				oninput={(e) => onTranslationChange((e.target as HTMLTextAreaElement).value)}
				onblur={onBlur}
				rows={1}
			></textarea>
		</div>
	{/if}

	<!-- Translation display (submitted / preview with translation) -->
	{#if translation && mode !== "editing" && !isShort}
		<div
			class="ml-4 pl-3 border-l-2 py-1
			{highlight && isAnnotated
				? (highlight.type === 'good'
					? 'border-green-400 bg-green-50/70'
					: 'border-red-400 bg-red-50/70')
				: 'border-foreground/10'}"
		>
			<!-- Display user translation (click for reference) -->
			{#if !reference && !loadingReference}
				<button
					type="button"
					onclick={onShowReference}
					class="text-left text-sm italic
					{highlight && isAnnotated
						? (highlight.type === 'good' ? 'text-green-800' : 'text-red-800')
						: 'text-muted-foreground'}
					hover:underline"
					title="Click to see reference translation"
				>
					{translation}
				</button>
			{:else if loadingReference}
				<div class="space-y-1">
					<p
						class="text-sm italic {highlight && isAnnotated ? (highlight.type === 'good' ? 'text-green-800' : 'text-red-800') : 'text-muted-foreground'}"
					>
						{translation}
					</p>
					<p class="text-xs text-muted-foreground/60">Loading reference…</p>
				</div>
			{:else if reference}
				<div class="space-y-1">
					<button
						type="button"
						onclick={onShowReference}
						class="text-left text-sm italic text-muted-foreground/60 hover:text-foreground transition-colors"
						title="Regenerate reference translation"
					>
						{reference}
					</button>
					<p class="text-xs text-muted-foreground/40">↑ reference</p>
				</div>
			{/if}

			<!-- Tutor feedback (clickable) -->
			{#if highlight && isAnnotated}
				<div class="mt-1.5">
					<button
						type="button"
						onclick={() => { showAskBubble = !showAskBubble }}
						class="group text-left text-xs leading-relaxed animate-fade-in {highlight.type === 'good' ? 'text-green-700' : 'text-red-700'} hover:underline transition-all"
					>
						{highlight.feedback}
						<span class="ml-1 opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground transition-opacity">Click to ask…</span>
					</button>

					<!-- Ask bubble -->
					{#if showAskBubble}
						<div class="mt-2 ml-2 pl-3 border-l-2 border-red-200">
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={askQuestion}
									onkeydown={(e) => { if (e.key === 'Enter') handleAsk(); }}
									placeholder="Ask a question about this feedback…"
									class="flex-1 text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/20"
								>
								<button
									type="button"
									onclick={handleAsk}
									disabled={!askQuestion.trim()}
									class="text-xs px-2 py-1.5 rounded-lg bg-foreground/10 text-foreground hover:bg-foreground/20 disabled:opacity-40 transition-colors"
								>
									<Send size={12} />
								</button>
							</div>

							<!-- Loading / answer / error -->
							{#if loadingTutorAnswer}
								<p class="mt-2 text-xs text-muted-foreground flex items-center gap-1"><Loader size={11} class="animate-spin" /> Thinking…</p>
							{:else if tutorAnswer}
								<div class="mt-2 prose prose-sm prose-neutral max-w-none text-xs">{@html renderMarkdown(tutorAnswer)}</div>
							{:else if tutorError}
								<p class="mt-2 text-xs text-red-400">{tutorError}</p>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{:else if translation && isShort && mode !== "editing"}
		<p class="ml-4 pl-3 border-l-2 border-foreground/5 text-sm text-muted-foreground/60 italic py-1">{translation}</p>
	{/if}

	<!-- Collapsed translation (editing mode, not active) -->
	{#if translation && mode === "editing" && !isActive}
		<p class="ml-4 pl-3 border-l-2 border-foreground/10 text-sm text-muted-foreground py-1 italic">{translation}</p>
	{/if}
</div>

<style>
@keyframes fade-in {
	from {
		opacity: 0;
		transform: translateY(-4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
.animate-fade-in {
	animation: fade-in 0.4s ease-out;
}
</style>
