<script lang="ts">
import { fade } from "svelte/transition";
import { reducedMotion } from "#lib/components/common/motion.ts";
import { createPlay } from "#lib/components/stickers/play.svelte.ts";
import Sticker from "#lib/components/stickers/Sticker.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { app, nameOf, tx } from "#lib/demo/app.svelte.ts";
import { followUp, myWriting, reviewDeck } from "#lib/demo/data.ts";
import { dev } from "#lib/demo/dev.svelte.ts";
import { reopen } from "#lib/demo/reopen.ts";
import { shelfScenarios } from "#lib/demo/scenarios.ts";
import FollowCard from "./FollowCard.svelte";
import ScenarioCard from "./ScenarioCard.svelte";

/*
 * Below the box: review as a slim row (only when cards are due), then at most four cards, in this order: the piece the
 * learner left unfinished, two scenarios (lib/demo/scenarios.ts shelfScenarios: the current issue first), and a card for
 * suggesting a situation (a link beside "All scenarios" when the shelf is full). A language without
 * prompts keeps the first and the last. The heading is drawn once per visit.
 */
let { head }: { head: string } = $props();
const follow = $derived(followUp());
const openPiece = $derived(myWriting().find((w) => w.open));
// Four at most: continue, follow-up, then scenarios; the "+" card only when there is room.
const prompts = $derived(shelfScenarios(app.lang).slice(0, 4 - (openPiece ? 1 : 0) - (follow ? 1 : 0)));
const roomForAdd = $derived((openPiece ? 1 : 0) + (follow ? 1 : 0) + prompts.length < 4);
const deck = $derived(reviewDeck());
const add = createPlay();

/* Review: how many cards are due and, in turns with it (half a minute each), one or two of those cards asked back.
   Pointing at the row brings the count back and holds it; the turns go on a full turn after the pointer leaves. */
const slides = $derived([
	{ main: tx("reviewDueShort"), small: tx("aboutMin", { m: Math.max(1, Math.round(deck.length * 0.5)) }) },
	...deck.slice(0, 2).map((c) => ({ main: tx("reviewRecall", { w: c.phrase ?? c.answer }), small: tx("reviewFrom", { where: c.where }) })),
]);
let at = $state(0);
let held = $state(false);
let ticker: HTMLElement | undefined = $state();
function show(to: number, dir = 1) {
	const els = ticker ? [...ticker.querySelectorAll<HTMLElement>(".slide")] : [];
	const from = at;
	if (to === from || !els[to]) return;
	at = to;
	if (reducedMotion()) return;
	const ease = "cubic-bezier(0.22, 1, 0.36, 1)";
	els[from].animate(
		[
			{ transform: "none", opacity: 1, visibility: "visible", filter: "blur(0)" },
			{ transform: `translateY(${-dir * 70}%)`, opacity: 0, visibility: "visible", filter: "blur(2px)" },
		],
		{ duration: 420, easing: ease },
	);
	els[to].animate(
		[
			{ transform: `translateY(${dir * 70}%)`, opacity: 0, filter: "blur(2px)" },
			{ transform: "none", opacity: 1, filter: "blur(0)" },
		],
		{ duration: 520, easing: ease },
	);
}
$effect(() => {
	const n = slides.length;
	if (held || n < 2) return;
	const timer = setInterval(() => show((at + 1) % n), dev.reviewEvery * 1000);
	return () => clearInterval(timer);
});
function hold(on: boolean) {
	held = on;
	if (on) show(0, -1);
}
</script>

<section class="shelf" aria-labelledby="shelf-h">
	{#if deck.length}
		<!-- biome-ignore lint/a11y/useSemanticElements: the handlers only pause the ticker; not form fields -->
		<div
			class="review-row"
			role="group"
			onpointerenter={() => hold(true)}
			onpointerleave={() => hold(false)}
			onfocusin={() => hold(true)}
			onfocusout={() => hold(false)}
		>
			<span class="n">{deck.length}</span>
			<!-- Every turn lies in one cell, so the row never changes size. -->
			<div class="ticker" aria-live="off" bind:this={ticker}>
				{#each slides as s, i}
					<p class="slide" class:on={i === at} aria-hidden={i !== at}>{s.main}<small>{s.small}</small></p>
				{/each}
			</div>
			<Button variant="secondary" size="sm" href="/review">{tx("reviewGo")}</Button>
		</div>
	{/if}
	{#if prompts.length}
		<div class="shelf-head">
			<h2 id="shelf-h">{tx(head)}</h2>
			<!-- No room left for the "+" card: suggesting a situation stays one step away, beside the catalogue. -->
			<span class="links">
				{#if !roomForAdd}
					<a href="/contribute">{tx("addTitle")}</a>
				{/if}
				<a href="/library">{tx("shelfAll")}</a>
			</span>
		</div>
	{:else}
		<p class="none-yet" id="shelf-h">{tx("noPromptsYet", { lang: nameOf(app.lang) })}</p>
	{/if}
	<div class="cards">
		{#if openPiece}
			<ScenarioCard
				site={openPiece.site}
				title={openPiece.title}
				line={tx("continueLine")}
				meta={tx("scenarioActive")}
				state="open"
				onclick={() => reopen(openPiece)}
			/>
		{/if}
		{#if follow}
			<div class="slot" out:fade={{ duration: 150 }}>
				{#key `${follow.kind}:${follow.w.id}`}
					<div class="cell" in:fade={{ duration: 250, delay: 150 }} out:fade={{ duration: 150 }}><FollowCard f={follow} /></div>
				{/key}
			</div>
		{/if}
		{#each prompts as q (q.id)}
			<ScenarioCard site={q.site} title={q.title[app.lang]} line={q.line[app.lang]} meta={tx("aboutMin", { m: q.min })} href="/scenario/{q.id}" />
		{/each}
		{#if roomForAdd}
			<a class="card add" href="/contribute" class:playing={add.playing} onpointerdown={() => add.play()}>
				<Sticker name="pr" size={44} tilt={-4} />
				<span
					><h3>{tx("addTitle")}</h3>
					<p>{tx("addLine")}</p></span
				>
			</a>
		{/if}
	</div>
</section>

<style>
.shelf {
	width: min(1080px, 100% - 40px);
	margin: clamp(44px, 8vh, 80px) auto 0;
}
/* The links go under a heading that needs the whole line, rather than squeezing it word by word. */
.shelf-head {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 4px 12px;
	margin-bottom: 14px;
}
.links {
	display: flex;
	gap: 16px;
	margin-left: auto;
}
.shelf-head a {
	color: var(--muted);
	font-size: 13.5px;
	text-decoration: none;
	white-space: nowrap;
	transition: color 150ms;
}
.shelf-head a:hover {
	color: var(--ink);
}
.none-yet {
	margin: 0 0 12px;
	color: var(--muted);
	font-size: 13.5px;
}
.slot {
	display: grid;
}
.cell {
	grid-area: 1 / 1;
	display: grid;
}
.cards {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 14px;
	padding: 4px 0 8px;
}
/* Postcards on a desk never lie square; one straightens when it is pointed at. */
.cards > :global(*) {
	transition: rotate 250ms var(--ease-spring);
}
.cards > :global(:nth-child(4n + 1)) {
	rotate: -1.1deg;
}
.cards > :global(:nth-child(4n + 2)) {
	rotate: 0.8deg;
}
.cards > :global(:nth-child(4n + 3)) {
	rotate: -0.5deg;
}
.cards > :global(:nth-child(4n)) {
	rotate: 1.2deg;
}
.cards > :global(:hover) {
	rotate: 0deg;
}
.cards :global(.card) {
	box-shadow: var(--paper-lift);
	transition:
		translate 200ms var(--ease-panel),
		box-shadow 200ms,
		background-color 150ms;
}
.cards :global(.card:hover) {
	translate: 0 -2px;
	box-shadow: var(--paper-lift-hi);
}
@media (prefers-reduced-motion: reduce) {
	.cards > :global(*),
	.cards :global(.card) {
		transition: none;
	}
}
@media (max-width: 1180px) and (min-width: 641px) {
	.cards {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
/* The last card asks for situations rather than showing one: the branch sticker on a quiet card. */
.card.add {
	display: flex;
	flex-direction: column;
	min-height: 272px;
	border: 1px dashed color-mix(in srgb, var(--ink) 20%, transparent);
	border-radius: 6px;
	color: inherit;
	text-decoration: none;
	cursor: pointer;
	transition:
		background-color 150ms,
		scale 150ms;
	align-items: center;
	justify-content: center;
	gap: 12px;
	padding: 22px;
	text-align: center;
	background: color-mix(in srgb, var(--bg) 90%, transparent);
}
.card.add:active {
	scale: 0.985;
}
.card.add:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.card.add:hover {
	background: var(--bg-2);
}
.card.add h3 {
	margin: 0 0 4px;
	font-size: 15px;
	font-weight: 600;
}
.card.add p {
	max-width: 22ch;
	margin: 0;
	color: var(--muted);
	font-size: 13px;
	line-height: 1.5;
}
/* Review is a slim row above the cards; it grows into the review page's card. */
.review-row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 10px 10px 16px;
	margin-bottom: 18px;
	border-radius: 6px;
	background: var(--card-bg);
	border: 1px solid var(--edge);
	box-shadow: var(--lift);
}
:global(html[data-vt="/>/review"]) .review-row,
:global(html[data-vt="/review>/"]) .review-row {
	view-transition-name: review;
}
.n {
	font-family: var(--font-serif-stack);
	font-size: 26px;
	line-height: 1;
	min-width: 1.4em;
}
.ticker {
	flex: 1;
	min-width: 0;
	display: grid;
	overflow: hidden;
	padding-block: 2px;
}
.slide {
	grid-area: 1 / 1;
	align-self: center;
	margin: 0;
	color: var(--ink-2);
	font-size: 14px;
	visibility: hidden;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.slide.on {
	visibility: visible;
}
.slide small {
	color: var(--muted);
	font-size: 13px;
	margin-inline-start: 6px;
}
@media (max-width: 640px) {
	/* Short of room, the estimate gives way to the count's own words. */
	.slide small {
		display: none;
	}
	.cards {
		grid-template-columns: 1fr;
		gap: 10px;
	}
	.card.add {
		flex-direction: row;
		justify-content: flex-start;
		text-align: start;
		padding: 14px 16px;
	}
	.card.add p {
		max-width: none;
	}
}
</style>
