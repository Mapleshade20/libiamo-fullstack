<script lang="ts">
import type { Snippet } from "svelte";
import { director } from "#lib/components/tour/director.svelte.ts";

/* The focused pages (the session, collecting, review): no sidebar, so the page owns the whole width. */
let { children }: { children: Snippet } = $props();
$effect(() => {
	document.documentElement.classList.add("focused");
	return () => document.documentElement.classList.remove("focused");
});
</script>

{#if !director.switching}
	{#key director.epoch}
		{@render children()}
	{/key}
{/if}
