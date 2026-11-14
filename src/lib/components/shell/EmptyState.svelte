<script lang="ts">
import { createPlay } from "#lib/components/stickers/play.svelte.ts";
import Sticker from "#lib/components/stickers/Sticker.svelte";
import type { StickerName } from "#lib/components/stickers/stickers.ts";
import Button from "#lib/components/ui/button/button.svelte";

/*
 * What a list says before anything is in it: the sticker of the page it belongs to, set on an empty sheet of the same
 * paper the list would hold, what will fill it, and the way to fill it. The sticker plays its press when the sheet is
 * pointed at, as it does in the sidebar. `compact` fits a narrow place (the sidebar).
 */
let {
	art,
	title,
	body,
	action,
	compact = false,
}: {
	art: StickerName | "clink";
	title: string;
	body?: string;
	action?: { label: string; href?: string; onclick?: () => void };
	compact?: boolean;
} = $props();
const play = createPlay();
// Paper put down by hand never lands at the same angle twice: the sheet and its label each get a small turn of their own.
const turn = (min: number, max: number) => Math.round((min + Math.random() * (max - min)) * 10) / 10;
const sheetTurn = turn(-1.6, 1.6);
const labelTurn = turn(-7, 4);
</script>

<div class="empty-state" class:compact class:playing={play.playing} role="presentation" onpointerenter={() => play.play()}>
	<div class="sheet" style:rotate="{sheetTurn}deg" aria-hidden="true">
		<span class="line"></span><span class="line short"></span><span class="line"></span>
		<span class="sticker-wrap"><Sticker name={art} size={compact ? 30 : 46} tilt={labelTurn} playing={play.playing} /></span>
	</div>
	<div class="words">
		<p class="title">{title}</p>
		{#if body}
			<p class="body">{body}</p>
		{/if}
		{#if action}
			<Button variant="secondary" size={compact ? "sm" : "default"} href={action.href} onclick={action.onclick} class="mt-3">{action.label}</Button>
		{/if}
	</div>
</div>

<style>
.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 18px;
	padding: 44px 16px 52px;
	text-align: center;
}
.compact {
	gap: 10px;
	padding: 18px 10px 8px;
}
/* A blank index card with faint rules; the page's sticker is pasted on its corner as a faded label, not the live icon:
   it comes to colour only when the sheet is pointed at. */
.sheet {
	position: relative;
	display: grid;
	align-content: center;
	gap: 9px;
	width: 132px;
	height: 92px;
	padding: 0 18px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	box-shadow: var(--lift);
	transition: rotate 300ms var(--ease-spring);
}
.empty-state:hover .sheet {
	rotate: 0deg !important;
}
.compact .sheet {
	width: 52px;
	height: 40px;
	flex: none;
	gap: 5px;
	padding: 0 8px;
	border-radius: 6px;
}
.line {
	display: block;
	height: 2px;
	border-radius: 2px;
	background: color-mix(in srgb, var(--ink) 9%, transparent);
}
.line.short {
	width: 60%;
}
.sticker-wrap {
	position: absolute;
	right: -16px;
	top: -18px;
	opacity: 0.55;
	filter: grayscale(0.85) sepia(0.2);
	transition:
		opacity 250ms var(--ease-panel),
		filter 250ms var(--ease-panel);
}
.empty-state:hover .sticker-wrap {
	opacity: 1;
	filter: none;
}
.compact .sticker-wrap {
	right: -10px;
	top: -10px;
}
.words {
	max-width: 34ch;
}
.title {
	margin: 0;
	font-size: 15.5px;
	font-weight: 600;
	color: var(--ink);
}
.compact .title {
	font-size: 13.5px;
	font-weight: 500;
}
.body {
	margin: 4px 0 0;
	color: var(--muted);
	font-size: 14px;
	line-height: 1.55;
}
.compact .body {
	font-size: 12.5px;
}
@media (prefers-reduced-motion: reduce) {
	.sheet,
	.sticker-wrap {
		transition: none;
	}
}
</style>
