<script lang="ts">
import PenMark from "./PenMark.svelte";

/* A line whose *starred* words are marked by hand (PenMark), so translations can choose what to mark. */
let { text, type = "underline", delay = 650 }: { text: string; type?: "underline" | "circle" | "box" | "highlight"; delay?: number } = $props();
const parts = $derived(text.split(/\*([^*]+)\*/));
</script>

{#each parts as p, i}
	{#if i % 2}
		<PenMark {type} {delay}>{p}</PenMark>
	{:else}
		{p}
	{/if}
{/each}
