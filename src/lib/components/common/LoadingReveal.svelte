<script lang="ts">
import type { Snippet } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import { blur } from "svelte/transition";

let { loading, placeholder, children }: { loading: boolean; placeholder: Snippet; children: Snippet } = $props();
const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)", true);
</script>

<div class="loading-reveal" aria-busy={loading}>
	{#if loading}
		<div class="layer" transition:blur={{ duration: reducedMotion.current ? 0 : 400, amount: 2 }} aria-hidden="true">{@render placeholder()}</div>
	{:else}
		<div class="layer" transition:blur={{ duration: reducedMotion.current ? 0 : 400, amount: 2 }}>{@render children()}</div>
	{/if}
</div>

<style>
.loading-reveal {
	display: grid;
	min-width: 0;
}
.layer {
	grid-area: 1 / 1;
	min-width: 0;
}
</style>
