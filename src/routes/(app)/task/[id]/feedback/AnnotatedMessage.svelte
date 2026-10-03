<script lang="ts">
import { TextHighlighter } from "$lib/components/ui/text-highlighter";
import type { AnnotationSpan, MessageAnnotation } from "$lib/practice/feedback";

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
	// Muted inks that read as marks on paper; rough-notation needs literal colours.
	if (kind === "grammar") return "#b4533c";
	if (kind === "vocab") return "#4d6f8f";
	if (kind === "delete") return "#8a8580";
	return "#4d6f8f";
}
</script>

<div class="rounded-xl border border-border bg-card p-4">
	<p class="[overflow-wrap:anywhere]">
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
							class="inline whitespace-pre-wrap rounded px-1 text-left outline-none transition-colors hover:bg-foreground/[0.08] focus-visible:ring-3 focus-visible:ring-ring/50"
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
