<script lang="ts">
import { splitTaggedText } from "$lib/llm/prompt-view";

/** Conversation feedback as marked-up learner messages, comments, grades and summary. */
type Preview = {
	annotations?: Array<{ messageId?: number; annotatedText?: string; comment?: string }>;
	objectives?: Array<{ text?: string; grade?: string }>;
	summary?: string;
};

let { feedback }: { feedback: Preview } = $props();

const MARK_CLASS: Record<string, string> = {
	grammar: "rounded-sm bg-[#f3ddc9] px-0.5 underline decoration-[#b5652b] decoration-wavy underline-offset-4",
	vocab: "rounded-sm bg-[#e4e6cf] px-0.5 underline decoration-[#6f7a2c] underline-offset-4",
	delete: "rounded-sm bg-[#f0d8d8] px-0.5 line-through decoration-[#9b3b3b]",
	mark: "rounded-sm bg-[#efe3bf] px-0.5",
};
</script>

<div class="space-y-4 text-sm">
	<ol class="space-y-3">
		{#each feedback.annotations ?? [] as annotation}
			<li class="rounded-lg border border-border bg-background px-3 py-2.5">
				<p class="text-xs text-muted-foreground">Message {annotation.messageId}</p>
				<p class="mt-1 leading-relaxed">
					{#each splitTaggedText(annotation.annotatedText ?? "", ["grammar", "vocab", "delete"]) as segment}
						{#if segment.tag}
							<span class={MARK_CLASS[segment.tag]} title={segment.tag}>{segment.text}</span>
						{:else}
							{segment.text}
						{/if}
					{/each}
				</p>
				{#if annotation.comment}
					<p class="mt-2 border-l-2 border-[#c9b98f] pl-3 text-muted-foreground">
						{#each splitTaggedText(annotation.comment, ["mark"]) as segment}
							{#if segment.tag}
								<span class={MARK_CLASS.mark}>{segment.text}</span>
							{:else}
								{segment.text}
							{/if}
						{/each}
					</p>
				{/if}
			</li>
		{/each}
	</ol>
	{#if feedback.objectives?.length}
		<ul class="space-y-1">
			{#each feedback.objectives as objective}
				<li class="flex gap-2">
					<span class="w-5 shrink-0 font-semibold">{objective.grade}</span>
					<span>{objective.text}</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if feedback.summary}
		<p class="leading-relaxed">{feedback.summary}</p>
	{/if}
</div>
