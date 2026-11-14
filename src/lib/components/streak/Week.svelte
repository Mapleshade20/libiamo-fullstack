<script lang="ts">
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import { onMount, tick } from "svelte";
import FloatingPanel from "$lib/components/common/FloatingPanel.svelte";
import { app, read, tx, write } from "$lib/demo/app.svelte";
import { dayKey, todayKind, weekCount, weekDays } from "$lib/demo/data";
import Digits from "./Digits.svelte";
import { DRINKS, type Drink, drinkOf } from "./glass/drinks";
import Glass from "./glass/Glass.svelte";
import type { Look, Moment } from "./glass/scene";

/*
 * The week (the main app's streak, made weekly): each day has its own glass, and today's stands in the corner. Upside
 * down until something is done; turned over when the learner has learned something or cleared their reviews; poured
 * and garnished when both are done, which is what counts. Nothing is ever lost. Whenever today's glass changes, or a
 * new day clears yesterday's, the popover opens by itself and plays it where the learner can see it.
 */
const kind = $derived(todayKind());
const n = $derived(weekCount());
const goal = $derived(app.prefs.weeklyGoal);
const lookOf = (k: string): Look => (k === "full" ? "full" : k === "learned" || k === "reviewed" ? "up" : "down");
const RANK: Record<Look, number> = { down: 0, up: 1, full: 2 };
const today = drinkOf();
const days = $derived(weekDays());
const names = $derived(
	Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(app.lang, { weekday: "narrow" }).format(new Date(2026, 9, 26 + i))),
);
let open = $state(false);
let celebrate = $state(false);
/** What the glasses show: today's state, except while a change is being played (it starts from the old one). */
let shown = $state<{ drink: Drink; look: Look }>({ drink: today, look: lookOf(todayKind()) });
let big = $state<Glass>();
let playing = false;
const dark = $derived(app.dark);

type Seen = { day: string; look: Look; drink: string };
const readSeen = () => read<Seen | null>("glassSeen", null);
const keepSeen = (look: Look) => write("glassSeen", { day: dayKey(), look, drink: today.id });

/** The moments from one state to another, today. */
function forward(from: Look, to: Look): Moment[] {
	if (RANK[to] <= RANK[from]) return [];
	return to === "full" ? (from === "down" ? ["flip", "pour"] : ["pour"]) : ["flip"];
}
async function show(start: { drink: Drink; look: Look }, steps: { m: Moment; next?: Drink }[], to: Look) {
	if (!steps.length) {
		keepSeen(to);
		return;
	}
	playing = true;
	shown = start;
	await new Promise((r) => setTimeout(r, 700));
	open = true;
	await tick();
	await new Promise((r) => setTimeout(r, 380));
	for (const s of steps) {
		if (!big || !open) break;
		if (s.m === "pour") celebrate = true;
		await big.play(s.m, s.next);
		const c = big?.current();
		if (c) shown = { drink: c.drink, look: c.look };
		await new Promise((r) => setTimeout(r, 260));
	}
	shown = { drink: today, look: to };
	keepSeen(to);
	playing = false;
}
function changes() {
	const to = lookOf(todayKind());
	const seen = readSeen();
	if (!seen) return keepSeen(to);
	if (seen.day === dayKey())
		return show(
			{ drink: today, look: seen.look },
			forward(seen.look, to).map((m) => ({ m })),
			to,
		);
	// A new day: yesterday's glass is emptied and turned down, and today's slides in.
	const was = DRINKS.find((d) => d.id === seen.drink) ?? today;
	const steps: { m: Moment; next?: Drink }[] = [];
	if (seen.look === "full") steps.push({ m: "spill" });
	if (seen.look === "up") steps.push({ m: "unflip" });
	if (was !== today) steps.push({ m: "swap", next: today });
	steps.push(...forward("down", to).map((m) => ({ m })));
	show({ drink: was, look: seen.look }, steps, to);
}
onMount(() => {
	sessionStorage.removeItem("weekEarned");
	changes();
});
// A day earned while this stays on the page (the demo's dev buttons): play it too.
$effect(() => {
	const to = lookOf(kind);
	if (!playing && RANK[to] > RANK[shown.look]) changes();
});
</script>

<FloatingPanel
	bind:open
	label={tx("weekTitle", { n, goal })}
	plainTrigger
	triggerClass="week-btn {kind === "full" ? "lit" : ""}"
	class="week-pop"
	onOpenChange={(o) => {
		if (!o) celebrate = false;
	}}
>
	{#snippet trigger()}
		<Glass drink={shown.drink} look={shown.look} size={34} idle={!open} />
		<span class="num" style:color={kind === "full" ? (dark ? today.ink2Dark : today.ink2) : undefined}><Digits value={n} /></span>
		<span class="of">/{goal}</span>
	{/snippet}
	<div class="hero"><Glass bind:this={big} drink={shown.drink} look={shown.look} size={150} stage /></div>
	<h2>{tx("weekTitle", { n, goal })}</h2>
	<p>
		{tx(
			n >= goal ? "weekMet" : kind === "full" ? "weekToday" : kind === "learned" ? "weekLearned" : kind === "reviewed" ? "weekReviewed" : "weekHow",
		)}
	</p>
	<div class="days">
		{#each days as d (d.i)}
			<span class={d.kind === "learned" || d.kind === "reviewed" ? "half" : d.kind} class:today={d.today} class:fresh={d.today && celebrate}>
				{names[d.i]}
				<i
					><Glass
						drink={DRINKS[d.i]}
						look={d.kind === "full" ? "full" : d.kind === "learned" || d.kind === "reviewed" ? "up" : "down"}
						size={24}
						inkPx={1}
					/></i
				>
			</span>
		{/each}
	</div>
	<a class="all" href="/profile#weeks" onclick={() => (open = false)}>{tx("weekAll")}<ChevronRight class="size-3.5" aria-hidden="true" /></a>
</FloatingPanel>

<style>
:global(.week-btn) {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	height: 44px;
	padding: 0 12px 0 6px;
	border: 0;
	border-radius: 14px;
	background: none;
	color: var(--muted);
	font-size: 19px;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
	outline: none;
	transition:
		background-color 180ms,
		color 300ms;
}
:global(.week-btn:hover),
:global(.week-btn[data-state="open"]) {
	background: var(--hover);
}
:global(.week-btn:focus-visible) {
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.num {
	transition: color 300ms;
}
:global(.week-btn .of) {
	align-self: flex-end;
	margin: 0 0 11px 2px;
	font-size: 12.5px;
	font-weight: 600;
	color: var(--muted);
}
.all {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 4px 8px;
	border-radius: 8px;
	color: var(--ink-2);
	font-size: 13px;
	text-decoration: none;
	transition:
		color 150ms,
		background-color 150ms;
}
.all:hover {
	color: var(--ink);
	background: var(--hover);
}
:global(.week-pop.floating-panel) {
	width: 312px;
	padding: 10px 18px 16px;
	text-align: center;
}
.hero {
	display: flex;
	/* What is thrown out leaves the picture here, not across the heading below. */
	overflow: clip;
	justify-content: center;
	margin: 0 0 4px;
}
h2 {
	font-size: 21px;
	margin-bottom: 2px;
}
p {
	margin: 0;
	color: var(--muted);
	font-size: 13px;
}
.days {
	display: grid;
	grid-template-columns: repeat(7, 1fr);
	gap: 4px;
	margin: 14px 0 12px;
	font-size: 12px;
	color: var(--muted);
}
.days span {
	display: grid;
	justify-items: center;
	gap: 4px;
}
/* Each day's own glass: the days to come stand faded, upside down. */
.days i {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	border-radius: 8px;
}
.days .later i,
.days .none i {
	opacity: 0.5;
}
.days .later i {
	opacity: 0.32;
}
.days .today {
	color: var(--ink);
	font-weight: 600;
}
.days .today i {
	background: var(--hover);
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 14%, transparent);
	opacity: 1;
}
.days .fresh i {
	animation: day-fill 600ms var(--ease-spring) 300ms both;
}
@keyframes day-fill {
	from {
		transform: scale(0.6);
	}
}
</style>
