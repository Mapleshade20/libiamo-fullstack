<script lang="ts">
import type { Attachment } from "svelte/attachments";
import { app } from "#lib/account/app.svelte.ts";
import { shell } from "#lib/components/shell/shell.svelte.ts";
import { page } from "$app/state";
import { patternHtml } from "./patterns.ts";
import "./backdrop.css";

/* The backdrop behind the home page and the scene card, as the learner set it (settings): nothing, a wallpaper, an
   old print along the bottom, or a faint painting. Drawn on the server: the day's picture comes with the root layout
   (server/backdrop/today.ts), and what differs between light and dark is left to the theme on <html>, which the
   server cannot always know. */
const choice = $derived(app.look.backdrop);
const pictures = $derived(page.data.pictures);
// Both inks, so the wallpaper the server drew is right whichever theme app.html settles on.
const pattern = $derived(choice === "pattern" ? [patternHtml(app.look.pattern, false), patternHtml(app.look.pattern, true)] : null);

// What the page lays itself out for. Paintings are for the light theme only; at night the choice stands but nothing is
// shown (the server writes it first, app.html settles it for a "system" theme).
$effect(() => {
	document.documentElement.dataset.backdrop = choice === "painting" && app.dark ? "none" : choice;
});

// A picture fades in once it has arrived (it may have arrived before the page woke up).
const fadeIn: Attachment<HTMLImageElement> = (img) => {
	const show = () => img.classList.add("in");
	if (img.complete && img.naturalWidth) show();
	else img.addEventListener("load", show, { once: true });
};
</script>

<div class="backdrop" class:viewing={shell.viewing} aria-hidden="true">
	<div class="scene" class:full={choice === "pattern" || choice === "painting"}>
		{#if choice === "image" && pictures}
			{@const p = pictures.image}
			{#key p.src}
				<div class="print" style:--drop="{p.drop}%" style:--zoom={p.zoom} style:--ink={p.ink}>
					<img
						src={p.src}
						srcset={p.srcset}
						sizes="max(110vw, 1100px)"
						width={p.width}
						height={p.height}
						alt=""
						loading="lazy"
						decoding="async"
						fetchpriority="low"
						{@attach fadeIn}
					>
				</div>
			{/key}
		{:else if choice === "painting" && pictures}
			{@const p = pictures.painting}
			{#key p.src}
				<div class="painting" style:--x="{p.x}%" style:--y="{p.y}%" style:--wait={p.color}>
					<img
						src={p.src}
						srcset={p.srcset}
						sizes="100vw"
						width={p.width}
						height={p.height}
						alt=""
						loading="lazy"
						decoding="async"
						fetchpriority="low"
						{@attach fadeIn}
					>
				</div>
			{/key}
		{:else if pattern}
			<div class="inks light">{@html pattern[0]}</div>
			<div class="inks dark">{@html pattern[1]}</div>
		{/if}
	</div>
</div>

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
