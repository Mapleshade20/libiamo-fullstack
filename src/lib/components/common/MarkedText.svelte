<script lang="ts">
import type { MarkedTextPart } from "$lib/text/marked-text";

let {
	parts,
	onMarkClick,
}: {
	parts: MarkedTextPart[];
	onMarkClick: (text: string, element: HTMLElement) => void;
} = $props();

function openMark(text: string, target: HTMLElement) {
	onMarkClick(text, target);
}

function handleClick(text: string, event: MouseEvent) {
	if (window.getSelection()?.toString().trim()) return;
	openMark(text, event.currentTarget as HTMLElement);
}

function handleKeydown(text: string, event: KeyboardEvent) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	openMark(text, event.currentTarget as HTMLElement);
}
</script>

<span class="whitespace-pre-wrap">
	{#each parts as part}
		{#if part.type === "text"}
			{part.content}
		{:else}
			<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
			<!-- biome-ignore-start lint/a11y/noNoninteractiveElementToInteractiveRole: This inline mark must fragment across text lines; native buttons are atomic boxes. -->
			<!-- biome-ignore lint/a11y/useSemanticElements: Preserve inline text flow; Enter and Space provide button activation (covered by the DOM test). -->
			<mark
				role="button"
				tabindex="0"
				class="inline cursor-pointer whitespace-pre-wrap rounded bg-yellow-200/60 px-1 text-left font-semibold text-inherit transition-colors hover:bg-yellow-300/90"
				onclick={(event) => handleClick(part.content, event)}
				onkeydown={(event) => handleKeydown(part.content, event)}
			>
				{part.content}
			</mark>
			<!-- biome-ignore-end lint/a11y/noNoninteractiveElementToInteractiveRole: see above -->
		{/if}
	{/each}
</span>
