<script lang="ts">
import type { TraceError } from "$lib/llm/lab";
import FeedbackPreview from "./FeedbackPreview.svelte";
import NotesPreview from "./NotesPreview.svelte";
import ValueView from "./ValueView.svelte";

/**
 * A recipe's output rendered the way it matters: Notes as cards, feedback as marked-up text,
 * everything else as a structured value. Add a renderer here when a recipe needs one.
 */
let {
	recipeId,
	output,
	outputText = null,
	error = null,
	compact = false,
}: { recipeId: string; output: unknown; outputText?: string | null; error?: TraceError | null; compact?: boolean } = $props();

let raw = $state(false);

const STAGE_LABELS: Record<TraceError["stage"], string> = {
	build: "Could not build the request",
	provider: "Provider error",
	parse: "Unusable response",
	finalize: "Rejected by validation",
};

type Renderer = "notes" | "feedback" | "judge" | "text" | "value";

const renderer = $derived.by((): Renderer => {
	if (output === null || output === undefined) return "value";
	if (typeof output === "string") return "text";
	if (recipeId === "review.notes" && Array.isArray(output)) return "notes";
	if (recipeId === "translation.generation-2" && Array.isArray((output as { notes?: unknown }).notes)) return "notes";
	if (recipeId === "practice.feedback") return "feedback";
	if (recipeId === "lab.judge") return "judge";
	return "value";
});

const notes = $derived(
	renderer === "notes" ? ((Array.isArray(output) ? output : (output as { notes: unknown[] }).notes) as Array<Record<string, never>>) : [],
);
</script>

<div class="space-y-2">
	{#if error}
		<p class="rounded-md border border-[#e3c4bd] bg-[#f8ebe7] px-3 py-2 text-sm text-[#7d2f22]">
			<span class="font-medium">{STAGE_LABELS[error.stage]}:</span>
			{error.message}
		</p>
	{/if}
	{#if output !== null && output !== undefined}
		{#if raw && outputText}
			<pre class="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{outputText}</pre>
		{:else if renderer === "notes"}
			<NotesPreview {notes} {compact} />
		{:else if renderer === "feedback"}
			<FeedbackPreview feedback={output as never} />
		{:else if renderer === "judge"}
			{@const verdict = output as { score?: number; rationale?: string }}
			<p class="text-sm"><span class="font-serif text-xl">{verdict.score}</span><span class="text-muted-foreground"> / 5</span></p>
			<p class="text-sm text-muted-foreground">{verdict.rationale}</p>
		{:else if renderer === "text"}
			<p class="whitespace-pre-wrap break-words text-sm leading-relaxed">{output}</p>
		{:else}
			<div class="text-sm"><ValueView value={output} /></div>
		{/if}
		{#if outputText && renderer !== "text"}
			<button
				type="button"
				class="min-h-8 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
				aria-pressed={raw}
				onclick={() => (raw = !raw)}
			>
				{raw ? "Show rendered" : "Show raw response"}
			</button>
		{/if}
	{:else if outputText}
		<pre class="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{outputText}</pre>
	{:else if !error}
		<p class="text-sm text-muted-foreground italic">No output.</p>
	{/if}
</div>
