<script lang="ts">
import { app } from "#lib/demo/app.svelte.ts";
import { renderBackdrop } from "./backdrops";
import { backdropState } from "./state.svelte";
import "./backdrop.css";

/* The backdrop behind the home page and the scene card, as the learner set it (settings): nothing, a wallpaper, an
   old print along the bottom, or a faint painting. */
let host: HTMLElement | undefined = $state();
$effect(() => {
	void app.dark;
	void backdropState.version;
	if (host) renderBackdrop(host);
});
</script>

<div class="backdrop" aria-hidden="true"><div class="scene" bind:this={host}></div></div>

<style>
/* Beside the sidebar, not under it, so the print is centred on the page. */
.backdrop {
	inset-inline-start: var(--side);
	transition: inset 250ms var(--ease-panel);
}
:global(html[data-vt="/>/live"]) .backdrop,
:global(html[data-vt="/live>/"]) .backdrop {
	view-transition-name: backdrop;
}
</style>
