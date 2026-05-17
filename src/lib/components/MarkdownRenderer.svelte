<script lang="ts">
import { renderMarkdown } from "$lib/markdown";
import { prepareMarkdownText } from "./utils/markdownUtils";

let { content = "" } = $props();

const normalizedContent = $derived(prepareMarkdownText(content));

const html = $derived(renderMarkdown(normalizedContent, { breaks: true }));
</script>

<div class="markdown-body">{@html html}</div>

<style>
.markdown-body {
	font-family: inherit;
	line-height: 1.5;
	word-wrap: break-word;
	overflow-wrap: anywhere;
}

:global(.markdown-body p) {
	margin: 0;
}

:global(.markdown-body p + p) {
	margin-top: 0.5em;
}

:global(.markdown-body br) {
	display: block;
}

:global(.markdown-body code) {
	background: #2b2d31;
	padding: 0.2rem;
	border-radius: 4px;
}

:global(.markdown-body pre) {
	background: #2b2d31;
	padding: 0.75rem;
	border-radius: 4px;
	overflow-x: auto;
	margin: 0.5em 0;
}

:global(.markdown-body pre code) {
	background: transparent;
	padding: 0;
}
</style>
