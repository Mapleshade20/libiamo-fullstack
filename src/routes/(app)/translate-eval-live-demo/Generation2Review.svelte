<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Sparkles from "@lucide/svelte/icons/sparkles";
import { Button } from "$lib/components/ui/button";
import type { ChatMessage } from "$lib/server/llm";
import type { Generation2Result } from "$lib/server/translation-evaluation/schema";
import Generation1Inspector from "./Generation1Inspector.svelte";
import type { GenerationMetadata } from "./session";

interface Props {
	result: Generation2Result | null;
	promptMessages: ChatMessage[];
	rawResponse: string | null;
	metadata: GenerationMetadata | null;
	submitting: boolean;
	error: string | null;
	onrun: () => void;
}

let { result, promptMessages, rawResponse, metadata, submitting, error, onrun }: Props = $props();
</script>

<section id="generation-2-review" class="mx-auto mt-12 w-full max-w-5xl border-t border-border pt-8" aria-labelledby="generation-2-title">
	<header class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">Generation 2 · Live review</p>
			<h2 id="generation-2-title" class="font-serif text-2xl tracking-tight">Vocabulary notes and example cards</h2>
			<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
				Run the production Generation 2 protocol against every current correction card. Results stay in this browser tab and are never written to the
				database.
			</p>
		</div>
		<Button data-live-generation-2 disabled={submitting} onclick={onrun}>
			{#if submitting}
				<LoaderCircle size={15} class="animate-spin motion-reduce:animate-none" />
				Generating…
			{:else if result}
				<RotateCcw size={15} />
				Run Generation 2 again
			{:else}
				<Sparkles size={15} />
				Run Generation 2
			{/if}
		</Button>
	</header>
	{#if promptMessages.length > 0}
		<Generation1Inspector
			messages={promptMessages}
			{rawResponse}
			{metadata}
			sectionId="generation-2-prompt"
			eyebrow="Generation 2 · Call artifacts"
			title="Correction cards → reusable notes"
			description="This is the exact no-database Generation 2 request. The validated vocabulary, bilingual dictionary definitions, and JSON examples are displayed below."
			embedded
		/>
	{/if}

	<div class="mt-6" aria-live="polite">
		{#if submitting}
			<div class="border-y border-border bg-card/35 px-4 py-5 text-sm text-muted-foreground">
				Generating vocabulary, bilingual definitions, and natural examples for each note…
			</div>
		{:else if error}
			<div class="border border-amber-300/80 bg-amber-50/70 px-4 py-4 text-sm text-amber-950">
				<p class="font-semibold">Generation 2 failed</p>
				<p class="mt-1 leading-relaxed">{error}</p>
			</div>
		{:else if result}
			<div class="mb-5 flex items-center justify-between gap-3 border-y border-border py-3 text-xs text-muted-foreground">
				<span>Validated structured result</span>
				<span class="font-mono tabular-nums">{result.notes.length} {result.notes.length === 1 ? "note" : "notes"}</span>
			</div>
			<div class="space-y-8">
				{#each result.notes as note, noteIndex (noteIndex)}
					<article class="overflow-hidden border border-border bg-card/55 shadow-xs">
						<header class="border-b border-border px-5 py-5 sm:px-6">
							<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
								<p class="text-[10px] font-semibold tracking-[0.17em] text-muted-foreground uppercase">Note {noteIndex + 1}</p>
								<p class="font-mono text-[11px] text-muted-foreground">
									Source {note.sourceCardOrdinals.length === 1 ? "card" : "cards"} ·
									{note.sourceCardOrdinals.map((ordinal) => ordinal + 1).join(", ")}
								</p>
							</div>
							<h3 class="font-serif text-xl leading-snug tracking-tight text-foreground">{note.vocab}</h3>
							<div class="mt-3 grid gap-2 text-sm leading-relaxed sm:grid-cols-2">
								<p><span class="font-semibold">Native definition:</span> {note.nativeDefinition}</p>
								<p class="text-foreground/75"><span class="font-semibold">Target definition:</span> {note.targetDefinition}</p>
							</div>
						</header>
						<ol class="grid md:grid-cols-2">
							{#each note.examples as example, exampleIndex (exampleIndex)}
								<li
									class="border-b border-border p-5 last:border-b-0 md:border-r md:[&:nth-child(2n)]:border-r-0 md:[&:nth-last-child(-n+2)]:border-b-0"
								>
									<p class="mb-3 text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Example {exampleIndex + 1}</p>
									<p class="font-serif text-base leading-relaxed">{example.nativeText}</p>
									<div class="mt-4 border-t border-dashed border-border pt-3">
										<p class="mb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Target example</p>
										<p class="text-sm leading-relaxed text-foreground/80">{example.targetText}</p>
									</div>
								</li>
							{/each}
						</ol>
					</article>
				{/each}
			</div>
		{:else}
			<div class="border-y border-border bg-card/25 px-4 py-5 text-sm leading-relaxed text-muted-foreground">
				Generation 2 has not been run for this evaluation.
			</div>
		{/if}
	</div>
</section>
