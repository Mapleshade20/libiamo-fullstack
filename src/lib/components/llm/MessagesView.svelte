<script lang="ts">
import Accordion from "$lib/components/common/Accordion.svelte";
import { Button } from "$lib/components/ui/button";
import type { LabChatMessage } from "$lib/llm/lab";
import { parseJsonContent, splitPromptSections } from "$lib/llm/prompt-view";
import ValueView from "./ValueView.svelte";

/** Request messages as a reader sees them: system prompts by section, JSON inputs as structured values. */
let { messages }: { messages: LabChatMessage[] } = $props();

let raw = $state<Record<number, boolean>>({});
const OPEN_SECTIONS_BELOW = 4_000;
</script>

<ol class="space-y-3">
	{#each messages as message, index}
		{@const json = parseJsonContent(message.content)}
		{@const sections = message.role === "system" ? splitPromptSections(message.content) : []}
		<li class="overflow-hidden rounded-xl border border-border bg-card">
			<div class="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1">
				<span class="text-sm font-medium capitalize">{message.role}</span>
				<span class="flex items-center gap-3 text-xs text-muted-foreground">
					<span class="tabular-nums">{message.content.length.toLocaleString("en-US")} chars</span>
					{#if json || sections.length > 1}
						<Button variant="ghost" size="sm" aria-pressed={raw[index] ?? false} onclick={() => (raw[index] = !raw[index])}>
							{raw[index] ? "Structured" : "Raw"}
						</Button>
					{/if}
				</span>
			</div>
			<div class="px-3 py-3 text-sm leading-relaxed">
				{#if raw[index]}
					<pre class="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{message.content}</pre>
				{:else if json}
					<ValueView value={json.value} />
				{:else if sections.length > 1}
					<div class="divide-y divide-border">
						{#each sections as section}
							{#if section.title === null}
								<p class="whitespace-pre-wrap pb-3">{section.body}</p>
							{:else}
								<Accordion title={section.title} open={message.content.length < OPEN_SECTIONS_BELOW} variant="plain">
									<p class="whitespace-pre-wrap">{section.body}</p>
								</Accordion>
							{/if}
						{/each}
					</div>
				{:else}
					<p class="whitespace-pre-wrap break-words">{message.content}</p>
				{/if}
			</div>
		</li>
	{/each}
</ol>
