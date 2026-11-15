<script lang="ts">
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import ChevronsLeft from "@lucide/svelte/icons/chevrons-left";
import Pause from "@lucide/svelte/icons/pause";
import Play from "@lucide/svelte/icons/play";
import { onMount, tick } from "svelte";
import { fade, fly } from "svelte/transition";
import { browser } from "$app/env";
import { director as d } from "./director.svelte";

/*
 * What the tour draws over the app: a pane that keeps the learner's clicks off the page (the tour does the clicking),
 * the light on what is being explained, the pointer, and the caption with its controls: leave, back a chapter, pause,
 * and go on, which cuts short a pause with nothing happening in it (a caption read before its time is up); a click
 * anywhere on the page does the same. Space pauses, → goes on, ← goes back a chapter, Esc leaves.
 */
let note: HTMLElement | undefined = $state();
let pos = $state({ x: 0, y: 0 });
const touch = browser && matchMedia("(pointer: coarse)").matches;

async function place() {
	await tick();
	const nw = note?.offsetWidth ?? 340;
	const nh = note?.offsetHeight ?? 140;
	const f = d.focus;
	const m = 16;
	if (!f) {
		pos = { x: innerWidth / 2 - nw / 2, y: innerHeight - nh - 28 };
		return;
	}
	// Below what is lit if it fits, else above, else beside it, else the foot of the screen.
	const cx = Math.max(m, Math.min(f.x + f.w / 2 - nw / 2, innerWidth - nw - m));
	if (f.y + f.h + 22 + nh < innerHeight - m) pos = { x: cx, y: f.y + f.h + 22 };
	else if (f.y - 22 - nh > m) pos = { x: cx, y: f.y - 22 - nh };
	else if (f.x + f.w + 24 + nw < innerWidth - m) pos = { x: f.x + f.w + 24, y: Math.max(m, Math.min(f.y, innerHeight - nh - m)) };
	else if (f.x - 24 - nw > m) pos = { x: f.x - 24 - nw, y: Math.max(m, Math.min(f.y, innerHeight - nh - m)) };
	else pos = { x: innerWidth / 2 - nw / 2, y: innerHeight - nh - m };
}
$effect(() => {
	void d.focus;
	void d.caption;
	place();
});

onMount(() => {
	const key = (e: KeyboardEvent) => {
		if (e.key === "Escape") d.end();
		else if (e.key === " ") d.toggle();
		else if (e.key === "ArrowRight") d.skip();
		else if (e.key === "ArrowLeft") d.back();
		else if ((e.target as Element)?.closest?.(".tour-note")) return;
		else return;
		e.preventDefault();
		e.stopPropagation();
	};
	// The page may move under the light (a card opening, a scroll the page makes itself): the light follows.
	let raf = 0;
	const loop = () => {
		d.follow();
		raf = requestAnimationFrame(loop);
	};
	raf = requestAnimationFrame(loop);
	const resize = () => place();
	addEventListener("keydown", key, true);
	addEventListener("resize", resize);
	return () => {
		cancelAnimationFrame(raf);
		removeEventListener("keydown", key, true);
		removeEventListener("resize", resize);
	};
});
</script>

<!-- The learner's clicks and scrolls stop here: the tour drives. -->
<div class="shield" aria-hidden="true" onclick={() => d.skip()} onwheel={(e) => e.preventDefault()} ontouchmove={(e) => e.preventDefault()}></div>
{#if d.focus}
	<div
		class="spot"
		style:left="{d.focus.x - 8}px"
		style:top="{d.focus.y - 8}px"
		style:width="{d.focus.w + 16}px"
		style:height="{d.focus.h + 16}px"
		aria-hidden="true"
		transition:fade={{ duration: 200 }}
	></div>
{/if}
{#if d.ring}
	{#key d.ring.n}
		<span class="ring" style:left="{d.ring.x}px" style:top="{d.ring.y}px" aria-hidden="true"></span>
	{/key}
{/if}
{#if d.keys}
	<div class="keys" style:left="{d.keys.x}px" style:top="{d.keys.y}px" aria-hidden="true" transition:fly={{ y: 6, duration: 220 }}>
		{#each d.keys.labels as k, i (i)}
			{#if i}
				<span class="plus">+</span>
			{/if}
			<kbd class:down={d.keys.down} class:wide={k.length > 1}>{k}</kbd>
		{/each}
	</div>
{/if}
<div
	class="pointer"
	class:shown={d.cursor.shown}
	class:down={d.cursor.down}
	class:finger={touch}
	style:transform="translate({d.cursor.x}px, {d.cursor.y}px)"
	aria-hidden="true"
>
	{#if touch}
		<span class="tap"></span>
	{:else}
		<svg viewBox="0 0 24 28" width="24" height="28" aria-hidden="true"><path d="M3 2.5V22.2L8.2 17.4L11.6 25.3L15.1 23.8L11.8 16.1H18.9Z" /></svg>
	{/if}
</div>
<!-- A click on the card's text goes on, like one on the page; the keyboard's way is →, caught for the whole window. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_interactive_supports_focus -->
<!-- biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard's way is →, caught for the whole window -->
<div
	class="tour-note"
	role="dialog"
	aria-modal="true"
	aria-label={d.t("tourTitle")}
	bind:this={note}
	onclick={(e) => {
		if (!(e.target as Element).closest("button")) d.skip();
	}}
	style:left="{pos.x}px"
	style:top="{pos.y}px"
	in:fly={{ y: 8, duration: 300 }}
>
	<div class="head">
		<span class="ch">{d.chapter + 1} / {d.chapters.length} · {d.t(`${d.chapters[d.chapter]?.key}Title`)}</span>
		<span class="dots" aria-hidden="true"
			>{#each d.chapters as _, i (i)}
				<i class:on={i === d.chapter} class:past={i < d.chapter}></i>
			{/each}</span
		>
	</div>
	<div class="stack" aria-live="polite">
		{#if d.caption}
			{#key d.caption.n}
				<p class="t" in:fly={{ y: 5, duration: 240, delay: 80 }} out:fade={{ duration: 90 }}>{d.caption.text}</p>
			{/key}
		{/if}
	</div>
	<div class="actions">
		<button type="button" class="text-link" onclick={() => d.end()}>{d.t("tourLeave")}</button>
		<span class="grow"></span>
		<button type="button" class="ctl" aria-label={d.t("tourBack")} title={d.t("tourBack")} disabled={d.chapter === 0} onclick={() => d.back()}>
			<ChevronsLeft aria-hidden="true" />
		</button>
		<button
			type="button"
			class="ctl"
			aria-label={d.t(d.paused ? "tourPlay" : "tourPause")}
			title={d.t(d.paused ? "tourPlay" : "tourPause")}
			onclick={() => d.toggle()}
		>
			{#if d.paused}
				<Play aria-hidden="true" />
			{:else}
				<Pause aria-hidden="true" />
			{/if}
		</button>
		<button type="button" class="ctl" aria-label={d.t("tourNext")} title={d.t("tourNext")} disabled={!d.idle} onclick={() => d.skip()}>
			<ChevronRight aria-hidden="true" />
		</button>
	</div>
</div>

<style>
.shield {
	position: fixed;
	inset: 0;
	z-index: 94;
	cursor: default;
}
:global(html.tour-drag) .shield {
	pointer-events: none;
}
.spot {
	position: fixed;
	z-index: 95;
	border-radius: 8px;
	box-shadow: 0 0 0 200vmax rgb(20 16 12 / 0.22);
	pointer-events: none;
	transition:
		left 420ms var(--ease-panel),
		top 420ms var(--ease-panel),
		width 420ms var(--ease-panel),
		height 420ms var(--ease-panel);
}
:global([data-theme="dark"]) .spot {
	box-shadow: 0 0 0 200vmax rgb(0 0 0 / 0.45);
}
/* Their own snapshots in a page's view transition, so they stay put above the pages crossing. */
.pointer {
	view-transition-name: tour-pointer;
	position: fixed;
	left: 0;
	top: 0;
	z-index: 98;
	pointer-events: none;
	opacity: 0;
	transition: opacity 250ms;
	will-change: transform;
}
.pointer.shown {
	opacity: 1;
}
.pointer svg {
	display: block;
	margin: -2px 0 0 -3px;
	filter: drop-shadow(0 2px 3px rgb(30 22 14 / 0.3));
	transition: scale 110ms var(--ease-panel);
	transform-origin: 3px 2px;
}
.pointer svg path {
	fill: var(--ink);
	stroke: #fffdf8;
	stroke-width: 1.5;
	stroke-linejoin: round;
}
.pointer.down svg {
	scale: 0.86;
}
.tap {
	display: block;
	width: 30px;
	height: 30px;
	margin: -15px 0 0 -15px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--ink) 22%, transparent);
	box-shadow: 0 0 0 2px color-mix(in srgb, #fff 80%, transparent);
	transition: scale 110ms var(--ease-panel);
}
.pointer.down .tap {
	scale: 0.8;
}
/* A shortcut being pressed: two keys in the hand of the app's own key (the box's send key), pressed together. */
.keys {
	position: fixed;
	z-index: 97;
	display: flex;
	align-items: center;
	gap: 8px;
	translate: -50% -50%;
	pointer-events: none;
}
.keys kbd {
	display: inline-grid;
	place-items: center;
	min-width: 46px;
	height: 46px;
	padding: 0 12px;
	border: 1px solid var(--line);
	border-radius: 8px;
	background: var(--raised);
	color: var(--ink);
	font: 600 19px / 1 var(--font-sans-stack, system-ui);
	box-shadow:
		0 3px 0 var(--line),
		0 6px 14px rgb(30 22 14 / 0.18);
	transition:
		translate 90ms var(--ease-panel),
		box-shadow 90ms var(--ease-panel);
}
.keys kbd.wide {
	font-size: 16px;
}
.keys kbd.down {
	translate: 0 3px;
	box-shadow:
		0 0 0 var(--line),
		0 2px 6px rgb(30 22 14 / 0.16);
}
.keys .plus {
	color: var(--ink-2);
	font-size: 20px;
	font-weight: 500;
}
.ring {
	position: fixed;
	z-index: 97;
	width: 34px;
	height: 34px;
	margin: -17px 0 0 -17px;
	border-radius: 50%;
	border: 2px solid var(--wine);
	pointer-events: none;
	animation: ring 520ms var(--ease-panel) forwards;
}
@keyframes ring {
	from {
		scale: 0.3;
		opacity: 0.9;
	}
	to {
		scale: 1.25;
		opacity: 0;
	}
}
.tour-note {
	view-transition-name: tour-note;
	position: fixed;
	z-index: 99;
	width: min(340px, calc(100vw - 32px));
	padding: 12px 14px 10px 16px;
	border-radius: 6px;
	background: var(--raised);
	color: var(--ink);
	box-shadow: var(--pop);
	transition:
		left 420ms var(--ease-panel),
		top 420ms var(--ease-panel);
}
.head {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 6px;
	font-size: 12px;
	color: var(--muted);
}
.ch {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.dots {
	display: inline-flex;
	gap: 4px;
}
.dots i {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: color-mix(in srgb, var(--ink) 16%, transparent);
	transition: background-color 250ms;
}
.dots i.past {
	background: color-mix(in srgb, var(--ink) 40%, transparent);
}
.dots i.on {
	background: var(--wine);
}
.stack {
	display: grid;
}
.t {
	grid-area: 1 / 1;
	margin: 0;
	font-size: 14.5px;
	line-height: 1.55;
}
.actions {
	display: flex;
	align-items: center;
	gap: 2px;
	margin-top: 8px;
}
.grow {
	flex: 1;
}
.text-link {
	font-size: 13px;
}
.ctl {
	display: inline-grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 6px;
	background: none;
	color: var(--ink-2);
	cursor: pointer;
	transition:
		color 150ms,
		background-color 150ms,
		opacity 200ms,
		scale 150ms;
}
.ctl :global(svg) {
	width: 17px;
	height: 17px;
}
.ctl:hover:not(:disabled) {
	color: var(--ink);
	background: var(--hover);
}
.ctl:active:not(:disabled) {
	scale: 0.97;
}
.ctl:disabled {
	opacity: 0.35;
	cursor: default;
}
.ctl:focus-visible,
.text-link:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
@media (pointer: coarse) {
	.ctl {
		width: 44px;
		height: 44px;
	}
}
@media (prefers-reduced-motion: reduce) {
	.spot,
	.tour-note {
		transition: none;
	}
}
</style>
