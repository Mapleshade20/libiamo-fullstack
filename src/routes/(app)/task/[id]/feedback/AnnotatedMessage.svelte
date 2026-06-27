<script lang="ts">
import { TextHighlighter } from "$lib/components/ui/text-highlighter";
import type { AnnotationSpan, MessageAnnotation } from "$lib/feedback/types";

let {
	annotation,
	messageId,
	onAnnotationClick,
}: {
	annotation: MessageAnnotation;
	messageId: number;
	onAnnotationClick: (span: AnnotationSpan, messageId: number, element: HTMLElement) => void;
} = $props();

// Parse the annotated text and render with TextHighlighter components
function parseAnnotatedHtml(annotatedText: string): Array<{ type: "text" | "annotation"; content: string; kind?: string }> {
	const parts: Array<{ type: "text" | "annotation"; content: string; kind?: string }> = [];
	const tagPattern = /<(grammar|vocab|delete)>([\s\S]*?)<\/\1>/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = tagPattern.exec(annotatedText)) !== null) {
		// Add text before the tag
		if (match.index > lastIndex) {
			parts.push({ type: "text", content: annotatedText.slice(lastIndex, match.index) });
		}

		// Add the annotated span
		parts.push({
			type: "annotation",
			content: match[2],
			kind: match[1],
		});

		lastIndex = match.index + match[0].length;
	}

	// Add remaining text
	if (lastIndex < annotatedText.length) {
		parts.push({ type: "text", content: annotatedText.slice(lastIndex) });
	}

	return parts;
}

const parts = $derived(parseAnnotatedHtml(annotation.annotatedText));

function openAnnotation(span: AnnotationSpan, target: HTMLElement) {
	onAnnotationClick(span, messageId, target);
}

function handleClick(span: AnnotationSpan, event: MouseEvent) {
	if (window.getSelection()?.toString().trim()) return;
	openAnnotation(span, event.currentTarget as HTMLElement);
}

function handleKeydown(span: AnnotationSpan, event: KeyboardEvent) {
	if (event.key !== "Enter" && event.key !== " ") return;
	event.preventDefault();
	openAnnotation(span, event.currentTarget as HTMLElement);
}

function getVariant(kind: string): "box" | "underline" | "strike-through" {
	if (kind === "grammar") return "box";
	if (kind === "vocab") return "underline";
	if (kind === "delete") return "strike-through";
	return "underline";
}

function getColor(kind: string): string {
	if (kind === "grammar") return "#ef4444";
	if (kind === "vocab") return "#3b82f6";
	if (kind === "delete") return "#6b7280";
	return "#3b82f6";
}
</script>

<div class="rounded-lg border border-[#e8e3db] bg-white p-4">
	<p class="text-[#2a2520] [overflow-wrap:anywhere]">
		{#each parts as part}
			{#if part.type === "text"}
				{part.content}
			{:else if part.type === "annotation" && part.kind}
				{@const span = annotation.spans.find(s => s.text === part.content && s.kind === part.kind)}
				{#if span}
					<TextHighlighter
						action={getVariant(part.kind)}
						color={getColor(part.kind)}
						strokeWidth={2}
						duration={800}
						delay={300}
						class="cursor-pointer hover:opacity-80 transition-opacity whitespace-pre-wrap"
					>
						<span
							role="button"
							tabindex="0"
							class="inline whitespace-pre-wrap text-left rounded px-1 transition-colors hover:bg-black/15"
							onclick={(e) => handleClick(span, e)}
							onkeydown={(e) => handleKeydown(span, e)}
						>
							{part.content}
						</span>
					</TextHighlighter>
				{:else}
					{part.content}
				{/if}
			{/if}
		{/each}
	</p>
</div>
