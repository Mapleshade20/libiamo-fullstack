<script lang="ts">
/** Generated vocabulary Notes laid out like study cards, so reviewers judge what learners would see. */
type PreviewNote = {
	vocab?: unknown;
	targetDefinition?: unknown;
	nativeDefinition?: unknown;
	examples?: Array<{ targetText?: unknown; nativeText?: unknown }>;
	sourceItemOrdinals?: unknown;
};

let { notes, compact = false }: { notes: PreviewNote[]; compact?: boolean } = $props();
</script>

{#if notes.length === 0}
	<p class="text-sm text-muted-foreground italic">No notes.</p>
{:else}
	<ul class="grid gap-3">
		{#each notes as note}
			<li class="rounded-lg border border-border bg-background px-4 py-3 shadow-[0_1px_0_rgba(56,54,47,0.04)]">
				<p class="font-serif text-lg leading-snug">{String(note.vocab ?? "")}</p>
				<p class="mt-1 text-sm">{String(note.targetDefinition ?? "")}</p>
				<p class="text-sm text-muted-foreground">{String(note.nativeDefinition ?? "")}</p>
				{#if Array.isArray(note.examples) && note.examples.length}
					<ol class="mt-2 space-y-1 border-t border-border/60 pt-2 text-sm {compact ? 'hidden sm:block' : ''}">
						{#each note.examples as example}
							<li>
								<span>{String(example.targetText ?? "")}</span>
								<span class="block text-xs text-muted-foreground">{String(example.nativeText ?? "")}</span>
							</li>
						{/each}
					</ol>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
