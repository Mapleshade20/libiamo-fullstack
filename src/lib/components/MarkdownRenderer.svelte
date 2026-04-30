<script lang="ts">
import { marked } from "marked";

let { content = "" } = $props();

const html = $derived(marked.parse(content || ""));
</script>

<div class="markdown-body">{@html html}</div>

<style>
.markdown-body {
	font-family: inherit;
	line-height: 1.5;
	word-wrap: break-word;
}
:global(.markdown-body p) {
	margin-bottom: 0.5em;
}
:global(.markdown-body code) {
	background: #2b2d31;
	padding: 0.2rem;
	border-radius: 4px;
}
</style>
