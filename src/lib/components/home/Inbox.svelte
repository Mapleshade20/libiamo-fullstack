<script lang="ts">
import Megaphone from "@lucide/svelte/icons/megaphone";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import { tick } from "svelte";
import { reducedMotion } from "$lib/components/common/motion";
import Reveal from "$lib/components/common/Reveal.svelte";
import Button from "$lib/components/ui/button/button.svelte";
import { ANNOUNCEMENTS, type Announcement, dateOf, local, markRead, REPLIES, type Reply, readIds } from "$lib/demo/announcements";
import { app, demoOpens, sandboxed, tx } from "$lib/demo/app.svelte";
import { absorbInto, collapseToDot, tossInto } from "./announcement-motion";

/*
 * Unread things wait above the greeting as a stack of cards (the main app's ScenarioMenuInbox): announcements, then
 * replies. The stack keeps one card's room in the page; spread out (hover, or a first tap) or opened, it lies over what
 * is below rather than pushing it. An announcement grows in place into an island holding the whole notice;
 * acknowledged, it closes into a dot, is tossed into the mark beside the greeting, and the mark takes the catch.
 */
let { mark }: { mark: () => HTMLElement | undefined } = $props();

type Item = { key: string; ann?: Announcement; reply?: Reply };
const items = $derived<Item[]>([
	...ANNOUNCEMENTS.filter((a) => !readIds().has(a.id)).map((a) => ({ key: `a${a.id}`, ann: a })),
	...(sandboxed() ? [] : (REPLIES[app.lang] ?? [])).map((r) => ({ key: r.id, reply: r })),
]);
const touch = matchMedia("(pointer: coarse)").matches;
let openAnn = $state<number | null>(null);
let spread = $state(false);
let acking = $state(false);
let openHeight = $state(0);
let box: HTMLElement | undefined = $state();

async function openIsland(id: number) {
	openAnn = openAnn === id ? null : id;
	spread = false;
	if (openAnn === null) return;
	await tick();
	// Laid out at its final width at once, so its height is measured once, not every frame.
	const card = box?.querySelector<HTMLElement>(`[data-ann="${id}"] .island`);
	openHeight = (card?.scrollHeight ?? 200) + 2;
	setTimeout(() => box?.querySelector<HTMLElement>(`[data-ann="${id}"] .ack`)?.focus({ preventScroll: true }), 200);
}
function closeIsland(focus = false) {
	const id = openAnn;
	openAnn = null;
	if (focus) tick().then(() => box?.querySelector<HTMLElement>(`[data-ann="${id}"] .summary`)?.focus());
}
async function acknowledge(id: number) {
	if (acking) return;
	acking = true;
	const card = box?.querySelector<HTMLElement>(`[data-ann="${id}"]`);
	const target = mark();
	if (card && target) {
		await collapseToDot(card, getComputedStyle(document.documentElement).getPropertyValue("--mark"));
		// The mark's wrapper is display: contents and has no box of its own (its rect is all zeros, which threw the dot off
		// the top-left of the screen): aim at the drawing inside it.
		await tossInto(card, (target.querySelector("svg") ?? target).getBoundingClientRect());
		absorbInto(target.querySelectorAll("path"));
	}
	markRead(id);
	openAnn = null;
	acking = false;
	await tick();
	// What was behind it steps forward into its place.
	if (!reducedMotion())
		box?.querySelectorAll<HTMLElement>(".note").forEach((n, i) => {
			n.animate(
				[
					{ opacity: 0, translate: "0 10px", scale: "0.96" },
					{ opacity: 1, translate: "0 0", scale: "1" },
				],
				{ duration: 320, delay: 60 + i * 40, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
			);
		});
}
// A touch, or the keyboard, first spreads the stack; a pointer has already spread it by hovering.
const firstSpreads = (e: MouseEvent) => items.length > 1 && !spread && (touch || e.detail === 0);

$effect(() => {
	if (openAnn === null) return;
	const away = (e: PointerEvent) => {
		if (!acking && !box?.contains(e.target as Node)) closeIsland();
	};
	const esc = (e: KeyboardEvent) => {
		if (e.key === "Escape" && !acking) closeIsland(true);
	};
	document.addEventListener("pointerdown", away);
	addEventListener("keydown", esc);
	return () => {
		document.removeEventListener("pointerdown", away);
		removeEventListener("keydown", esc);
	};
});
const count = $derived(Math.max(1, items.length));
</script>

<Reveal open={items.length > 0} visible class="inbox-wrap">
	<div class="slot" style:--count={count}>
		<section
			class="inbox"
			class:expanded={spread && openAnn === null}
			class:has-open={openAnn !== null}
			style:--count={count}
			style:--open-h="{openHeight}px"
			aria-label={tx("inboxLabel")}
			bind:this={box}
			onpointerenter={(e) => {
				if (e.pointerType === "mouse" && openAnn === null) spread = true;
			}}
			onpointerleave={(e) => {
				if (e.pointerType === "mouse" && !box?.contains(document.activeElement)) spread = false;
			}}
		>
			{#each items as it, i (it.key)}
				{@const style = `--i:${i};--depth:${Math.min(i, 2)};${i > 2 && !spread ? "opacity:0;" : ""}`}
				{#if it.ann}
					{@const a = it.ann}
					{@const open = openAnn === a.id}
					<article class="note ann" class:open {style} data-ann={a.id} aria-labelledby="ann-{a.id}-t">
						<div class="island">
							<button
								type="button"
								class="summary"
								aria-expanded={open}
								aria-controls="ann-{a.id}-d"
								onclick={(e) => {
									if (openAnn !== null) return;
									if (firstSpreads(e)) spread = true;
									else openIsland(a.id);
								}}
							>
								<span class="ic"><Megaphone class="size-5" aria-hidden="true" /></span>
								<span class="copy">
									<span class="meta"><span>{tx("annLabel")}</span><span>{dateOf(a.date)}</span></span>
									<span class="t" id="ann-{a.id}-t">{local(a.title)}</span>
									<span class="r">{tx("annRead")}</span>
								</span>
							</button>
							<div class="detail" id="ann-{a.id}-d" inert={!open}>
								<div class="body">
									{#each local(a.body).split("\n\n") as p}
										<p>{p}</p>
									{/each}
								</div>
								<div class="actions">
									<Button variant="ghost" size="sm" class="rounded-lg" onclick={() => closeIsland(true)}>{tx("annClose")}</Button>
									<Button size="sm" class="ack rounded-lg" onclick={() => acknowledge(a.id)}>{tx("annAck")}</Button>
								</div>
							</div>
						</div>
					</article>
				{:else if it.reply}
					{@const r = it.reply}
					<a
						class="note"
						href="/"
						{style}
						onclick={(e) => {
							e.preventDefault();
							if (firstSpreads(e)) spread = true;
							else demoOpens();
						}}
					>
						<span class="ic"><MessageCircle class="size-5" aria-hidden="true" /></span>
						<span class="copy">
							<span class="meta"><span>{r.site}</span><span>{tx("ageAgo", { age: r.age })}</span></span>
							<span class="t">{r.title}</span>
							<span class="r">{tx("replyNew")}{r.count > 1 ? ` × ${r.count}` : ""}</span>
						</span>
					</a>
				{/if}
			{/each}
		</section>
	</div>
</Reveal>

<style>
:global(.inbox-wrap) {
	width: min(22rem, 100% - 40px);
	margin: 0 auto;
}
:global(.inbox-wrap.open) {
	margin-bottom: 18px;
}
.slot {
	position: relative;
	height: calc(76px + (min(var(--count, 1), 3) - 1) * 9px);
}
.inbox {
	--ease-settle: cubic-bezier(0.32, 0, 0.2, 1);
	/* A damped spring (ratio 0.72): the island overshoots its size by ~4% and settles. */
	--ease-island: linear(
		0,
		0.039,
		0.133,
		0.257,
		0.391,
		0.523,
		0.642,
		0.746,
		0.832,
		0.9,
		0.951,
		0.988,
		1.013,
		1.028,
		1.036,
		1.038,
		1.037,
		1.034,
		1.029,
		1.024,
		1.019,
		1.014,
		1.01,
		1.007,
		1.004,
		1.002,
		1.001,
		1
	);
	position: absolute;
	z-index: 6;
	top: 0;
	left: 50%;
	translate: -50% 0;
	height: calc(76px + (min(var(--count), 3) - 1) * 9px);
	width: 100%;
	transition:
		height 300ms var(--ease-settle),
		width 300ms var(--ease-settle);
}
.inbox.expanded {
	height: calc(var(--count) * 84px - 8px);
	transition: height 420ms var(--ease-panel);
}
.inbox.has-open {
	width: min(26rem, calc(100vw - 32px));
	height: var(--open-h);
	transition:
		height 560ms var(--ease-island),
		width 560ms var(--ease-island);
}
.note {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 76px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	border: 1px solid var(--edge);
	border-radius: 6px;
	background: var(--raised);
	box-shadow: var(--paper-lift);
	color: var(--ink);
	text-align: start;
	text-decoration: none;
	cursor: pointer;
	transform-origin: top center;
	transform: translateY(calc(var(--depth) * 9px)) scale(calc(1 - var(--depth) * 0.045));
	z-index: calc(10 - var(--i));
	transition:
		transform 300ms var(--ease-settle),
		opacity 220ms ease-out,
		background-color 220ms ease-out;
}
.inbox.expanded .note {
	transform: translateY(calc(var(--i) * 84px));
	transition:
		transform calc(380ms + var(--depth) * 35ms) cubic-bezier(0.22, 1.12, 0.36, 1),
		opacity 260ms ease-out;
}
.inbox.has-open .note:not(.open) {
	transform: translateY(14px) scale(0.94);
	opacity: 0;
	pointer-events: none;
}
.note:hover {
	background: var(--raised);
}
.note:focus-visible,
.summary:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.ic {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	flex: none;
	color: var(--muted);
}
.copy {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}
.meta {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 12px;
	color: var(--muted);
}
.t {
	font-size: 14px;
	font-weight: 600;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}
.r {
	font-size: 12.5px;
	color: var(--muted);
}
.note.ann {
	display: block;
	padding: 0;
	overflow: hidden;
	transition:
		transform 300ms var(--ease-settle),
		opacity 220ms ease-out,
		height 300ms var(--ease-settle),
		border-radius 300ms var(--ease-settle),
		box-shadow 300ms var(--ease-settle);
}
.note.ann.open {
	z-index: 20;
	height: var(--open-h);
	border-radius: 6px;
	background: var(--raised);
	box-shadow: 0 1.25rem 3rem -1rem rgb(40 30 15 / 0.32);
	transform: none;
	cursor: default;
	transition:
		transform 560ms var(--ease-island),
		height 560ms var(--ease-island),
		border-radius 560ms var(--ease-island),
		box-shadow 560ms var(--ease-island);
}
.island {
	display: flex;
	flex-direction: column;
	width: 100%;
}
.note.ann.open .island {
	width: min(26rem, calc(100vw - 32px));
}
.summary {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 74px;
	width: 100%;
	padding: 8px 12px;
	border: 0;
	background: none;
	color: inherit;
	text-align: start;
	cursor: pointer;
	border-radius: inherit;
}
.open .summary {
	align-items: flex-start;
	padding: 16px 18px 8px;
	cursor: default;
}
.open .summary .ic {
	color: var(--mark);
}
.open .summary .t {
	white-space: normal;
	font-size: 15px;
}
.open .summary .r {
	display: none;
}
.detail {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 0 18px 16px 58px;
	opacity: 0;
	transition: opacity 120ms ease-out;
}
.open .detail {
	opacity: 1;
	transition: opacity 260ms ease-out 140ms;
}
.body {
	font-size: 14px;
	line-height: 1.6;
	color: var(--ink-2);
}
.body p {
	margin: 0 0 8px;
}
.actions {
	display: flex;
	justify-content: flex-end;
	gap: 6px;
}
</style>
