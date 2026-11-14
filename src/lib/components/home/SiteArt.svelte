<script lang="ts">
import Feather from "@lucide/svelte/icons/feather";
import Hash from "@lucide/svelte/icons/hash";
import Languages from "@lucide/svelte/icons/languages";
import Mail from "@lucide/svelte/icons/mail";
import MessageSquare from "@lucide/svelte/icons/message-square";
import MessagesSquare from "@lucide/svelte/icons/messages-square";
import type { SiteArt } from "$lib/demo/data";

/*
 * A site's drawing, as a two-colour print: the lucide icon in a thick clay stroke set a little off its register, then
 * the same icon in ink over it. `disc` sets it on an uneven disc in the light swatch (the dark theme's badge).
 */
let { art, disc = false, size = 92 }: { art: SiteArt; disc?: boolean; size?: number } = $props();
const Icon = $derived({ quill: Feather, bubble: MessageSquare, letter: Mail, hash: Hash, chat: MessagesSquare, cards: Languages }[art]);
</script>

<span class="site-art" style:width="{size}px" style:height="{size}px" aria-hidden="true">
	{#if disc}
		<svg class="disc" viewBox="0 0 100 100" aria-hidden="true">
			<polygon points="50,6 72,12 88,27 94,50 87,73 67,90 44,94 22,86 9,66 8,40 19,20 34,10" />
		</svg>
	{/if}
	<span class="layer clay"><Icon strokeWidth={4.2} absoluteStrokeWidth={false} /></span>
	<span class="layer ink"><Icon strokeWidth={1.5} /></span>
</span>

<style>
.site-art {
	position: relative;
	display: inline-block;
	flex: none;
}
.disc {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	fill: var(--tone);
}
.layer {
	position: absolute;
	inset: 22%;
	display: grid;
}
.layer :global(svg) {
	width: 100%;
	height: 100%;
}
.clay {
	color: #d97757;
	opacity: 0.85;
	translate: 4% 4%;
}
.ink {
	color: #141413;
}
</style>
