<script lang="ts">
import type { AnnotationSpan } from "$lib/feedback/types";

let {
	comment,
	messageId,
	onHighlightClick,
}: {
	comment: string;
	messageId: number;
	onHighlightClick: (span: AnnotationSpan, messageId: number, element: HTMLElement) => void;
} = $props();

function parseHighlightedComment(value: string): Array<{ type: "text" | "highlight"; content: string }> {
	const parts: Array<{ type: "text" | "highlight"; content: string }> = [];
	const tagPattern = /<highlight>([\s\S]*?)<\/highlight>/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = tagPattern.exec(value)) !== null) {
		if (match.index > lastIndex) {
			parts.push({ type: "text", content: value.slice(lastIndex, match.index) });
		}
		parts.push({ type: "highlight", content: match[1] });
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < value.length) {
		parts.push({ type: "text", content: value.slice(lastIndex) });
	}

	return parts;
}

const parts = $derived(parseHighlightedComment(comment));

function openHighlight(text: string, target: HTMLElement) {
	onHighlightClick({ kind: "vocab", text }, messageId, target);
}

function handleClick(text: string, event: MouseEvent) {
	if (window.getSelection()?.toString().trim()) return;
	openHighlight(text, event.currentTarget as HTMLElement);
}

function handleKeydown(text: string, event: KeyboardEvent) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	openHighlight(text, event.currentTarget as HTMLElement);
}
</script>

<div class="leading-relaxed whitespace-pre-wrap">
	{#each parts as part}
		{#if part.type === "text"}
			{part.content}
		{:else}
			<span
				role="button"
				tabindex="0"
				class="inline cursor-pointer whitespace-pre-wrap rounded bg-yellow-200/60 px-1 text-left font-medium transition-colors hover:bg-yellow-300/90"
				onclick={(event) => handleClick(part.content, event)}
				onkeydown={(event) => handleKeydown(part.content, event)}
			>
				{part.content}
			</span>
		{/if}
	{/each}
</div>
