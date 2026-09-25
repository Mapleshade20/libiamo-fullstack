<script lang="ts">
import ValueView from "./ValueView.svelte";

/** A structured, readable view of any JSON value: objects as labelled rows, arrays as numbered items. */
let { value, depth = 0 }: { value: unknown; depth?: number } = $props();

const entries = $derived(value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : []);
const isScalar = $derived(value === null || typeof value !== "object");
</script>

{#if isScalar}
	{#if typeof value === "string"}
		<span class="whitespace-pre-wrap break-words">{value}</span>
	{:else if value === null || value === undefined}
		<span class="text-muted-foreground italic">null</span>
	{:else}
		<span class="font-mono text-[0.8125rem] text-[#5b4a2e]">{String(value)}</span>
	{/if}
{:else if Array.isArray(value)}
	{#if value.length === 0}
		<span class="text-muted-foreground italic">empty list</span>
	{:else}
		<ol class="space-y-1.5">
			{#each value as item, index}
				<li class="flex gap-2">
					<span class="w-5 shrink-0 pt-px text-right font-mono text-xs text-muted-foreground tabular-nums">{index}</span>
					<div class="min-w-0 flex-1 {item && typeof item === 'object' ? 'rounded-md border border-border/70 bg-background/60 px-2.5 py-2' : ''}">
						<ValueView value={item} depth={depth + 1} />
					</div>
				</li>
			{/each}
		</ol>
	{/if}
{:else if entries.length === 0}
	<span class="text-muted-foreground italic">empty object</span>
{:else}
	<dl class="grid gap-x-3 gap-y-1.5 {depth > 3 ? '' : 'sm:grid-cols-[minmax(6rem,max-content)_minmax(0,1fr)]'}">
		{#each entries as [ key, item ] (key)}
			<dt class="pt-px font-mono text-xs text-muted-foreground">{key}</dt>
			<dd class="min-w-0"><ValueView value={item} depth={depth + 1} /></dd>
		{/each}
	</dl>
{/if}
