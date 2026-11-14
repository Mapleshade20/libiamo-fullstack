<script lang="ts">
import Camera from "@lucide/svelte/icons/camera";
import ExternalLink from "@lucide/svelte/icons/external-link";
import Pencil from "@lucide/svelte/icons/pencil";
import { onMount, tick } from "svelte";
import { account } from "#lib/account/account.svelte.ts";
import InfoTip from "#lib/components/common/InfoTip.svelte";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import { shake } from "#lib/components/common/motion.ts";
import { tip } from "#lib/components/common/tip.ts";
import AvatarSticker from "#lib/components/stickers/AvatarSticker.svelte";
import { DRINKS } from "#lib/components/streak/glass/drinks.ts";
import Glass from "#lib/components/streak/glass/Glass.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { app, toast, tx } from "#lib/demo/app.svelte.ts";
import { myWriting } from "#lib/demo/data.ts";
import { notesNow } from "#lib/notebook/notebook.svelte.ts";
import { historyNow } from "#lib/week/week.svelte.ts";

/*
 * The profile: who the learner is here. Their picture and name (the name edited in a small dialog behind the pencil,
 * as in the main app), a few numbers, and every week they have practised: the whole history the week popover only
 * glimpses. Settings (how the app works for them) are a page of their own.
 */
// Each week with the aim it was held to; a week's days are local dates (`YYYY-MM-DD`), drawn as this device's.
const weeks = $derived((await historyNow(26)).map((w) => ({ ...w, start: new Date(`${w.start}T00:00:00`) })));
const goal = $derived(weeks[weeks.length - 1].goal);
const met = (w: { days: string[]; goal: number }) => w.days.filter((d) => d === "full").length >= w.goal;
// Weeks in a row that met the aim, counting back from last week (this one may still be under way).
const run = $derived.by(() => {
	let n = 0;
	const last = weeks.length - 1;
	if (met(weeks[last])) n++;
	for (let i = last - 1; i >= 0 && met(weeks[i]); i--) n++;
	return n;
});
const total = $derived(weeks.reduce((n, w) => n + w.days.filter((d) => d === "full").length, 0));
const pieces = $derived(myWriting().filter((w) => w.finishedAt).length);
const phrases = $derived((await notesNow()).length);
const months = $derived(
	weeks.map((w, i) =>
		i === 0 || w.start.getMonth() !== weeks[i - 1].start.getMonth() ? new Intl.DateTimeFormat(app.lang, { month: "short" }).format(w.start) : "",
	),
);
const dayNames = $derived(
	Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(app.lang, { weekday: "short" }).format(new Date(2026, 9, 26 + i))),
);
const dayOf = (w: Date, i: number) => {
	const d = new Date(w);
	d.setDate(w.getDate() + i);
	return new Intl.DateTimeFormat(app.lang, { month: "short", day: "numeric" }).format(d);
};
const KIND: Record<string, string> = { full: "profDayFull", learned: "profDayLearned", reviewed: "profDayReviewed", none: "profDayNone" };
const look = (k: string) => (k === "learned" || k === "reviewed" ? "half" : k);

let editing = $state(false);
let draft = $state("");
let nameInput: HTMLInputElement | undefined = $state();
async function editName() {
	draft = app.prefs.name;
	editing = true;
	await tick();
	nameInput?.focus({ preventScroll: true });
	nameInput?.select();
}
function saveName(e: SubmitEvent) {
	e.preventDefault();
	const n = draft.trim();
	if (!n) return shake(nameInput);
	app.prefs.name = n;
	app.save();
	editing = false;
	toast(tx("setSaved"));
}

// The picture is Gravatar's for the account's address, as in the main app (server/account/gravatar.ts): changing it
// happens there, so the camera says where and with which address, and asks before leaving.
let gravatar = $state(false);

let grid: HTMLElement | undefined = $state();
onMount(() => {
	document.title = `${tx("navProfile")} · ${tx("homeTitle")}`;
	// The latest weeks are the ones that matter: a narrow screen starts scrolled to them.
	grid?.scrollTo({ left: grid.scrollWidth });
});
</script>

<main class="sheet">
	<header class="me">
		<div class="pic">
			<AvatarSticker name={app.prefs.name} photo={app.prefs.avatar} size={84} />
			<button
				type="button"
				class="pic-btn"
				aria-label={tx("profPicture")}
				aria-haspopup="dialog"
				use:tip={tx("profPicture")}
				onclick={() => (gravatar = true)}
			>
				<Camera class="size-4" aria-hidden="true" />
			</button>
		</div>
		<div class="who">
			<div class="name-row">
				<h1>{app.prefs.name}</h1>
				<span use:tip={tx("setEditName")}
					><Button variant="ghost" size="icon" class="rounded-lg text-muted-foreground" aria-haspopup="dialog" onclick={editName}
						><Pencil strokeWidth={1.5} aria-hidden="true" /></Button
					></span
				>
			</div>
			<p class="em">{account.me.email}</p>
		</div>
	</header>

	<div class="stats">
		<div><b>{run}</b><span>{tx("profRun")}</span></div>
		<div><b>{total}</b><span>{tx("profDays")}</span></div>
		<div><b>{pieces}</b><span>{tx("profPieces")}</span></div>
		<div><b>{phrases}</b><span>{tx("profPhrases")}</span></div>
	</div>

	<section id="weeks" aria-labelledby="weeks-h">
		<h2 id="weeks-h">{tx("profWeeks")}<InfoTip text={tx("weekRule")} label={tx("profWeeks")} /></h2>
		<div class="card">
			<div class="grid-scroll" bind:this={grid}>
				<div class="cal" style:--n={weeks.length}>
					<span></span>
					{#each months as m}
						<span class="month">{m}</span>
					{/each}
					<span></span>
					{#each weeks as w}
						<span class="met"
							>{#if met(w)}
								<Glass drink={DRINKS[2]} look="full" size={15} inkPx={0.9} />
							{/if}</span
						>
					{/each}
					{#each dayNames as dn, di}
						<span class="dn">{di % 2 === 0 ? dn : ""}</span>
						{#each weeks as w, wi}
							{@const k = w.days[di]}
							{#if k === "later"}
								<span class="day later"></span>
							{:else}
								<span class="day {look(k)}" use:tip={{ text: `${dayOf(w.start, di)} · ${tx(KIND[k])}`, side: "top" }}></span>
							{/if}
						{/each}
					{/each}
				</div>
			</div>
			<div class="legend">
				<span><i class="day full"></i>{tx("profDayFull")}</span>
				<span><i class="day half"></i>{tx("profDayHalf")}</span>
				<span class="met-key"><Glass drink={DRINKS[2]} look="full" size={15} inkPx={0.9} />{tx("profWeekMet", { goal })}</span>
			</div>
		</div>
	</section>
</main>

<ModalDialog bind:open={editing} labelledby="name-h">
	<form onsubmit={saveName}>
		<h2 id="name-h" class="mb-6">{tx("setEditName")}</h2>
		<label for="name-in" class="mb-1.5 block text-sm font-medium">{tx("setName")}</label>
		<input id="name-in" class="input" bind:this={nameInput} bind:value={draft} maxlength="40" autocomplete="name" data-initial-focus>
		<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<Button variant="secondary" onclick={() => (editing = false)}>{tx("setCancel")}</Button>
			<Button type="submit" disabled={!draft.trim() || draft.trim() === app.prefs.name}>{tx("setSave")}</Button>
		</div>
	</form>
</ModalDialog>

<ModalDialog bind:open={gravatar} labelledby="gr-h">
	<h2 id="gr-h" class="mb-4">{tx("profGrTitle")}</h2>
	<p class="gr-p">{tx("profGrBody")}</p>
	<p class="gr-mail">{account.me.email}</p>
	<p class="gr-p">{tx("profGrHow")}</p>
	<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (gravatar = false)}>{tx("setCancel")}</Button>
		<Button href="https://gravatar.com" target="_blank" rel="noopener noreferrer" onclick={() => (gravatar = false)} data-initial-focus
			>{tx("profGrGo")}<ExternalLink aria-hidden="true" /></Button
		>
	</div>
</ModalDialog>

<style>
.gr-p {
	margin: 0;
	font-size: 15px;
	line-height: 1.6;
	color: var(--ink-2);
}
.gr-mail {
	margin: 10px 0 14px;
	padding: 10px 14px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--ink) 4%, transparent);
	font-weight: 600;
	overflow-wrap: anywhere;
}
.me {
	display: flex;
	align-items: center;
	gap: 20px;
	margin-bottom: 28px;
}
.pic {
	position: relative;
	flex: none;
}
.pic-btn {
	position: absolute;
	right: -4px;
	bottom: -4px;
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	border: 1px solid var(--line);
	background: var(--raised);
	color: var(--ink-2);
	box-shadow: var(--lift);
	cursor: pointer;
	transition:
		color 150ms,
		scale 150ms;
}
.pic-btn:hover {
	color: var(--ink);
}
.pic-btn:active {
	scale: 0.97;
}
.pic-btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.who {
	min-width: 0;
}
.name-row {
	display: flex;
	align-items: center;
	gap: 4px;
}
.name-row h1 {
	margin: 0;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.em {
	margin: 2px 0 0;
	color: var(--muted);
	font-size: 14px;
}
/* Four in a row, or two by two on a phone: never three and one left over. */
.stats {
	display: grid;
	grid-template-columns: repeat(4, max-content);
	gap: 14px 40px;
	padding: 18px 0 4px;
	border-top: 1px solid var(--line-soft);
}
.stats div {
	display: grid;
}
@media (max-width: 560px) {
	.stats {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px 20px;
	}
}
.stats b {
	font: 400 32px / 1.15 var(--font-serif-stack);
	font-variant-numeric: tabular-nums;
}
.stats span {
	color: var(--muted);
	font-size: 13px;
}
section {
	margin-top: 34px;
}
section > h2 {
	display: flex;
	align-items: center;
	font-size: 21px;
	margin-bottom: 10px;
}
.card {
	padding: 18px 18px 14px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	box-shadow: var(--paper-lift);
}
/* Centred when the weeks fit, scrolled from the start when they do not (safe centring never clips the first ones). */
.grid-scroll {
	display: flex;
	justify-content: safe center;
	overflow-x: auto;
	padding-bottom: 4px;
}
/* The weeks run left to right, the days top to bottom; each week that met the aim has a small full glass over it. */
.cal {
	display: grid;
	grid-template-columns: 2.6em repeat(var(--n), 16px);
	gap: 4px;
	width: max-content;
	flex: none;
	align-items: center;
}
.month {
	font-size: 11.5px;
	color: var(--muted);
	white-space: nowrap;
	overflow: visible;
	width: 0;
}
.met {
	display: grid;
	place-items: center;
	height: 16px;
}
.dn {
	font-size: 11.5px;
	color: var(--muted);
}
.day {
	display: block;
	width: 16px;
	height: 16px;
	border-radius: 4px;
	background: var(--well);
	box-shadow: inset 0 0 0 1px var(--line-soft);
}
/* The week popover's colours: a burning day, a pilot-light day. */
.day.full {
	background: var(--ink-wine);
	box-shadow: none;
}
.day.half {
	background: color-mix(in oklch, var(--ink-wine) 16%, transparent);
	box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--ink-wine) 55%, transparent);
}
.day.later {
	background: none;
	box-shadow: inset 0 0 0 1px var(--line-soft);
	opacity: 0.5;
}
.legend {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 18px;
	margin-top: 14px;
	font-size: 12.5px;
	color: var(--muted);
}
.legend span {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}
.legend .day {
	width: 11px;
	height: 11px;
	border-radius: 3px;
}
.input {
	width: 100%;
	height: 40px;
	padding: 0 12px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--field);
	color: var(--ink);
	font-size: 15px;
}
.input:focus {
	outline: 0;
	border-color: color-mix(in srgb, var(--ink) 40%, transparent);
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 50%, transparent);
}
</style>
