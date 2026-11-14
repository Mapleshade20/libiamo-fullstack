<script lang="ts">
import type { Collector } from "#lib/components/collect/collector.svelte.ts";
import HighlightText from "#lib/components/collect/HighlightText.svelte";

/* A passage of a situation: highlightable when the page collects, plain otherwise. */
let {
	text,
	lang,
	block,
	collector,
	class: className = "",
}: { text: string; lang: string; block: string; collector?: Collector; class?: string } = $props();
</script>

{#if collector}
	<HighlightText {text} {lang} {block} {collector} class={className} />
{:else}
	<p class="plain {className}" {lang}>{text}</p>
{/if}

<style>
.plain {
	margin: 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
</style>
