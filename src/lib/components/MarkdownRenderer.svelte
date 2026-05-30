<script lang="ts">
import { renderMarkdown } from "$lib/markdown";
import { prepareMarkdownText } from "./utils/markdownUtils";

let { content = "" } = $props();

const normalizedContent = $derived(prepareMarkdownText(content));

const html = $derived(renderMarkdown(normalizedContent, { breaks: true }));
</script>

<div class="markdown-body prose max-w-none">{@html html}</div>
