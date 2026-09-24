<script lang="ts">
import { prepareMarkdownText, renderMarkdown } from "$lib/text/markdown";

let { content = "" } = $props();

const normalizedContent = $derived(prepareMarkdownText(content));

const html = $derived(renderMarkdown(normalizedContent, { breaks: true }));
</script>

<div class="markdown-body prose max-w-none">{@html html}</div>
