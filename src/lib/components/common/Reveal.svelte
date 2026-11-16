<script lang="ts">
import type { Snippet } from "svelte";
import { onMount } from "svelte";

/*
 * A part that opens or closes in place: it grows on its grid rows, 250ms open, 150ms close (transitions.dev
 * "Accordion", as Accordion.svelte opens its panel), its content fading in after it starts to open. Whatever is open on
 * the first paint is simply there: nothing grows into place on load. `visible` lets content (a stack's spread, a focus
 * ring) reach past the edge once it is open.
 */
let { open, children, visible = false, class: className = "" }: { open: boolean; children: Snippet; visible?: boolean; class?: string } = $props();
let ready = $state(false);
onMount(() => {
	const f = requestAnimationFrame(() => (ready = true));
	return () => cancelAnimationFrame(f);
});
</script>

<div class="reveal {className}" class:open class:ready inert={!open}>
	<div class="reveal-inner" class:visible={visible && open}>{@render children()}</div>
</div>

<style>
.reveal {
	display: grid;
	grid-template-rows: 0fr;
}
.reveal.open {
	grid-template-rows: 1fr;
}
.reveal-inner {
	min-height: 0;
	overflow: hidden;
	opacity: 0;
}
.open > .reveal-inner {
	opacity: 1;
}
.reveal-inner.visible {
	overflow: visible;
}
/* It slides open only for those who have not asked for less motion. */
@media (prefers-reduced-motion: no-preference) {
	.reveal.ready {
		transition: grid-template-rows 150ms var(--ease-panel);
	}
	.reveal.ready.open {
		transition-duration: 250ms;
	}
	.ready > .reveal-inner {
		transition: opacity 120ms ease-out;
	}
	.ready.open > .reveal-inner {
		transition: opacity 220ms ease-out 60ms;
	}
}
</style>
