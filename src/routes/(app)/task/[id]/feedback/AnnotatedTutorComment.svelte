<script lang="ts">
import MarkedText from "$lib/components/learning-feedback/MarkedText.svelte";
import type { AnnotationSpan } from "$lib/feedback/types";
import { parseMarkedText } from "$lib/marked-text";

let {
	comment,
	messageId,
	onHighlightClick,
}: {
	comment: string;
	messageId: number;
	onHighlightClick: (span: AnnotationSpan, messageId: number, element: HTMLElement) => void;
} = $props();

const parts = $derived(parseMarkedText(comment).parts);

function openHighlight(text: string, target: HTMLElement) {
	onHighlightClick({ kind: "vocab", text }, messageId, target);
}
</script>

<div class="leading-relaxed whitespace-pre-wrap"><MarkedText {parts} onMarkClick={openHighlight} /></div>
