<script lang="ts">
import type { ChatMessage, ChatUsage } from "$lib/server/llm";

type Metadata = {
	temperature: number;
	model: string | null;
	finishReason: string | null;
	usage: ChatUsage | null;
	durationMs: number;
	repairUsed: boolean;
};

interface Props {
	messages: ChatMessage[];
	rawResponse?: string | null;
	metadata?: Metadata | null;
	sectionId?: string;
	eyebrow?: string;
	title?: string;
	description?: string;
	promptOpen?: boolean;
	embedded?: boolean;
}

let {
	messages,
	rawResponse = null,
	metadata = null,
	sectionId = "generation-1-prompt",
	eyebrow = "Protocol review",
	title = "Generation 1 request",
	description = "",
	promptOpen = true,
	embedded = false,
}: Props = $props();

function displayContent(content: string): string {
	try {
		return JSON.stringify(JSON.parse(content), null, 2);
	} catch {
		return content;
	}
}
</script>

<section
	id={sectionId}
	class={embedded ? "mt-7 w-full border-y border-border py-7" : "mx-auto mt-12 w-full max-w-5xl border-t border-border pt-8"}
	aria-labelledby="{sectionId}-title"
>
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<p class="mb-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">{eyebrow}</p>
			<h2 id="{sectionId}-title" class="font-serif text-2xl tracking-tight">{title}</h2>
			<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
				{description ||
					(metadata
						? "These are the complete messages sent to the provider."
						: "This preview uses the prefilled draft; after a run it is replaced by the exact messages sent to the provider. The prompt is fixed to the multi-issue and no-card few-shot protocol.")}
			</p>
		</div>
		{#if metadata}
			<dl class="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-muted-foreground sm:text-right">
				<div>
					<dt class="inline font-medium text-foreground">Temperature</dt>
					<dd class="inline">{metadata.temperature.toFixed(1)}</dd>
				</div>
				<div>
					<dt class="inline font-medium text-foreground">Model</dt>
					<dd class="inline">{metadata.model ?? "unknown"}</dd>
				</div>
				<div>
					<dt class="inline font-medium text-foreground">Finish</dt>
					<dd class="inline">{metadata.finishReason ?? "unknown"}</dd>
				</div>
				<div>
					<dt class="inline font-medium text-foreground">Duration</dt>
					<dd class="inline">{(metadata.durationMs / 1000).toFixed(1)}s</dd>
				</div>
				<div>
					<dt class="inline font-medium text-foreground">Repair</dt>
					<dd class="inline">{metadata.repairUsed ? "used" : "not used"}</dd>
				</div>
				{#if metadata.usage}
					<div class="col-span-2">
						<dt class="inline font-medium text-foreground">Tokens</dt>
						<dd class="inline">
							{metadata.usage.promptTokens ?? "?"}
							prompt · {metadata.usage.completionTokens ?? "?"} completion · {metadata.usage.totalTokens ?? "?"} total
						</dd>
					</div>
				{/if}
			</dl>
		{/if}
	</div>

	<details class="group mt-5 border-y border-border bg-card/35" open={promptOpen}>
		<summary class="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
			<span class="flex items-center justify-between gap-3">
				<span>Complete prompt · {messages.length} messages</span>
				<span class="text-xs text-muted-foreground group-open:hidden">Open</span>
				<span class="hidden text-xs text-muted-foreground group-open:inline">Close</span>
			</span>
		</summary>
		<div class="space-y-4 border-t border-border px-4 py-5">
			{#each messages as message, index (index)}
				<article>
					<p class="mb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">{index + 1} · {message.role}</p>
					<pre
						class="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background/80 p-4 font-mono text-xs leading-relaxed text-foreground/85"
					>{displayContent(message.content)}</pre>
				</article>
			{/each}
		</div>
	</details>

	{#if rawResponse}
		<details class="group mt-5 border-y border-border bg-card/35">
			<summary class="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
				<span class="flex items-center justify-between gap-3">
					<span>Raw assistant response</span>
					<span class="text-xs text-muted-foreground group-open:hidden">Open</span>
					<span class="hidden text-xs text-muted-foreground group-open:inline">Close</span>
				</span>
			</summary>
			<div class="border-t border-border p-4">
				<pre
					class="max-h-[42rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background/80 p-4 font-mono text-xs leading-relaxed text-foreground/85"
				>{displayContent(rawResponse)}</pre>
			</div>
		</details>
	{/if}
</section>
