<script lang="ts">
import { MediaQuery } from "svelte/reactivity";
import { blur } from "svelte/transition";

/* Text that changes in place swaps through a soft blur (transitions.dev "Text states swap"): the old words go, the new
   come into the same cell, so nothing below moves twice. */
let { text, class: className = "" }: { text: string; class?: string } = $props();
const reduced = new MediaQuery("(prefers-reduced-motion: reduce)", false);
</script>

<span class="swap {className}">
	{#key text}
		<span
			class="cell"
			in:blur={{ duration: reduced.current ? 0 : 220, delay: reduced.current ? 0 : 110, amount: 4 }}
			out:blur={{ duration: reduced.current ? 0 : 120, amount: 4 }}
			>{text}</span
		>
	{/key}
</span>

<style>
.swap {
	display: grid;
}
.cell {
	grid-area: 1 / 1;
}
</style>
