<script lang="ts">
import CornerDownLeft from "@lucide/svelte/icons/corner-down-left";
import Eye from "@lucide/svelte/icons/eye";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import { diffChars, diffWords } from "diff";
import { onMount, tick } from "svelte";
import { app } from "#lib/account/app.svelte.ts";
import { tip } from "#lib/components/common/tip.ts";
import RateMark from "#lib/components/review/RateMark.svelte";
import ReviewFace from "#lib/components/review/ReviewFace.svelte";
import FocusBar from "#lib/components/shell/FocusBar.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import { practised, rateTourCard, sandboxed } from "#lib/components/tour/sandbox.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { tx } from "#lib/i18n/tx.ts";
import { rate as sendRating } from "#lib/notebook/notebook.remote.ts";
import { deckNow } from "#lib/notebook/notebook.svelte.ts";
import type { ReviewCard } from "#lib/notebook/types.ts";
import { hintOf, type Verdict, verdictOf } from "#lib/review/check.ts";
import { ratingSender } from "#lib/review/sender.ts";
import { createSitting, type Item, RATINGS, type Rating } from "#lib/review/session.ts";
import { beforeNavigate, goto } from "$app/navigation";

/*
 * Review: one card at a time, Anki's way. The learner answers first (the field says what to write), then the card
 * turns: the asked part is filled in, their answer shown against it as a diff in the same line, and a line on why.
 * Ratings show only when the card comes back; a card rated within minutes returns in this sitting. Enter is Good.
 * The counts below are what is left: new, learning, review. At the end, the sitting's cards and how each went.
 */
// The sitting is the cards due when the page opened; ratings change it here, not by asking the server again.
const deck: ReviewCard[] = await deckNow();
const sitting = createSitting(deck);
const started = Date.now();
let shownAt = started;
let v = $state(0);
let shown = $state<{ given: string; verdict: Verdict } | null>(null);
let given = $state("");
let placeholder = $state("");
let input: HTMLInputElement | undefined = $state();
let doneBtn: HTMLElement | null = $state(null);
const item = $derived((void v, sitting.current));
const card = $derived(item?.card);
$effect(() => {
	void item;
	shownAt = Date.now();
});
const counts = $derived((void v, sitting.counts()));
const reviewed = $derived((void v, sitting.done.length));
const finished = $derived((void v, !item && sitting.waiting === 0));
const next = $derived((void v, item ? sitting.intervals(item) : []));
const progress = $derived(reviewed / Math.max(1, reviewed + counts.new + counts.learning + counts.review));
const TONE: Record<Rating, string> = { again: "--bad", hard: "--warn", good: "--ok", easy: "--cool" };
const LABEL: Record<Rating, string> = { again: "rvAgain", hard: "rvHard", good: "rvGood", easy: "rvEasy" };

// Their answer against the one they settled on, in place: words, and within a word they nearly had, letters.
const diff = $derived.by(() => {
	if (!shown || !card || !shown.given.trim() || shown.verdict === "exact") return null;
	const words = diffWords(shown.given.trim(), card.answer, { ignoreCase: true });
	const out: { value: string; added?: boolean; removed?: boolean; inWord?: boolean }[] = [];
	for (let i = 0; i < words.length; i++) {
		const a = words[i];
		const b = words[i + 1];
		if (a.removed && b?.added && /^\S+$/.test(a.value.trim()) && /^\S+$/.test(b.value.trim()) && near(a.value.trim(), b.value.trim())) {
			out.push(...diffChars(a.value, b.value, { ignoreCase: true }).map((c) => ({ ...c, inWord: true })));
			i++;
		} else out.push(a);
	}
	return out;
});
// A slip, not another word: most letters shared.
function near(a: string, b: string) {
	const same = diffChars(a, b, { ignoreCase: true }).reduce((n, p) => n + (p.added || p.removed ? 0 : p.value.length), 0);
	return same / Math.max(a.length, b.length) >= 0.6;
}

async function focusNow() {
	await tick();
	if (finished) doneBtn?.focus();
	else if (shown) (document.activeElement as HTMLElement | null)?.blur();
	else input?.focus({ preventScroll: true });
}
// Whether each card was answered right the first time it came up in this sitting (by its typed answer).
const firstRight = new Map<string, boolean>();
function check(text: string) {
	if (!card) return;
	shown = { given: text, verdict: verdictOf(card, text) };
	if (!firstRight.has(card.id)) firstRight.set(card.id, shown.verdict === "exact" || shown.verdict === "close");
	focusNow();
}
/* Ratings go to the server one after another (each sees the last one's card, so the one that empties the queue
   knows it), while the page moves on at once. */
type Job = { it: Item<ReviewCard>; rating: Rating; verdict: Verdict | null; seconds: number; requestId: string };
const sending = ratingSender<Job>(
	async ({ it, ...rating }) => {
		const s = await sendRating({ id: it.card.id, ...rating });
		sitting.settle(it, s);
	},
	() => {
		v++;
		void focusNow();
	},
);
const failed = $derived((void v, sending.failed));
let discarding = false;
function reloadSaved() {
	discarding = true;
	location.reload();
}
beforeNavigate(({ cancel }) => {
	if (!discarding && !sandboxed() && sitting.waiting > 0) {
		cancel();
		toast(tx("rvSaving"));
	}
});
function send(it: Item<ReviewCard>, r: Rating, verdict: Verdict | null, seconds: number) {
	if (sandboxed()) {
		sitting.settle(it, rateTourCard(it.card.id, r));
		if (!sitting.current) practised("reviewed");
		return;
	}
	sending.enqueue({ it, rating: r, verdict, seconds, requestId: crypto.randomUUID() });
}
function rate(r: Rating) {
	if (!shown || failed) return;
	const verdict = shown.given.trim() ? shown.verdict : "none";
	const it = sitting.rate(r, !sandboxed());
	if (it) send(it, r, verdict, Math.min(86_400, Math.round((Date.now() - shownAt) / 1000)));
	v++;
	shown = null;
	given = "";
	placeholder = "";
	focusNow();
}
const minutes = $derived(finished ? Math.max(1, Math.round((Date.now() - started) / 60_000)) : 0);
const firstTry = $derived(finished ? sitting.done.filter((i) => firstRight.get(i.card.id)).length : 0);

onMount(() => {
	// Nothing due: nothing to sit through.
	if (!deck.length) return void goto("/", { replace: true });
	document.title = `${tx("rvTitle")} · ${tx("homeTitle")}`;
	focusNow();
	const keys = (e: KeyboardEvent) => {
		const t = e.target as HTMLElement;
		if (!shown || t.closest("input, textarea, button, a")) return;
		const i = ["1", "2", "3", "4"].indexOf(e.key);
		if (i >= 0 || e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			rate(i >= 0 ? RATINGS[i] : "good");
		}
	};
	addEventListener("keydown", keys);
	return () => removeEventListener("keydown", keys);
});
</script>

{#snippet asked()}
	{#if diff}
		<span class="part"
			>{#each diff as p, i}
				{#if p.added}
					<ins>{p.value}</ins>
				{:else if p.removed}
					<del>{p.value}</del>
					{#if diff[i + 1]?.added && !p.inWord && !/\s$/.test(p.value)}
						{" "}
					{/if}
				{:else}
					{p.value}
				{/if}
			{/each}</span
		>
	{:else}
		<span class="part" class:ok={shown?.verdict === "exact"}>{card?.answer}</span>
	{/if}
{/snippet}

{#if deck.length}
	<FocusBar exit={{ label: tx("rvCloseBtn"), href: "/" }}>
		<div class="progress">
			<div class="track"><i style:width="{progress * 100}%"></i></div>
		</div>
	</FocusBar>
	<main class="wrap">
		{#if failed}
			<div role="alert">
				<p>{tx("auSomethingWrong")}</p>
				<Button onclick={() => sending.retry()}>{tx("tryAgain")}</Button>
				<Button variant="secondary" class="h-auto min-h-10 max-w-full whitespace-normal py-2" onclick={reloadSaved}>{tx("rvDiscard")}</Button>
			</div>
		{:else if !item && !finished}
			<div role="status" aria-busy="true">{tx("rvSaving")}</div>
		{/if}
		{#if finished}
			<section class="study summary in">
				<h1>{tx("rvDone")}</h1>
				<div class="stats">
					<div><b>{reviewed}</b><span>{tx("rvSumCards")}</span></div>
					<div><b>{firstTry}</b><span>{tx("rvSumFirst")}</span></div>
					<div><b>{minutes}</b><span>{tx("rvSumMin")}</span></div>
				</div>
				<ul class="went">
					{#each sitting.done as it (it.card.id)}
						<li>
							<span class="said" lang={app.lang}>{it.card.answer}</span>
							<span class="trail" role="img" aria-label={it.ratings.map((r) => tx(LABEL[r])).join(", ")}>
								{#each it.ratings as r}
									<span class="tipped" use:tip={tx(LABEL[r])}><RateMark rating={r} /></span>
								{/each}
							</span>
						</li>
					{/each}
				</ul>
				<Button href="/" bind:ref={doneBtn}>{tx("rvHome")}</Button>
			</section>
		{:else if card}
			{#key item}
				<section class="study" class:in={reviewed > 0} aria-live="polite">
					<div class="face"><ReviewFace face={card} lang={app.lang} asked={shown ? asked : undefined} /></div>
					{#if shown}
						{#if card.why}
							<div class="back"><p class="why">{card.why}</p></div>
						{/if}
					{:else}
						<form
							class="answer"
							onsubmit={(e) => {
								e.preventDefault();
								check(given);
							}}
						>
							<input
								bind:this={input}
								bind:value={given}
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								enterkeyhint="done"
								lang={app.lang}
								placeholder={placeholder || tx("rvGapPh")}
								aria-label={tx("rvGapPh")}
							>
							<div class="tools">
								<button
									type="button"
									use:tip={tx("rvHint")}
									onclick={() => {
										placeholder = hintOf(card.answer);
										input?.focus();
									}}
								>
									<Lightbulb class="size-[17px]" aria-hidden="true" />
								</button>
								<button type="button" use:tip={tx("rvShow")} onclick={() => check("")}><Eye class="size-[17px]" aria-hidden="true" /></button>
								<button type="submit" class="go" use:tip={tx("rvCheck")}><CornerDownLeft class="size-[17px]" aria-hidden="true" /></button>
							</div>
						</form>
					{/if}
				</section>
			{/key}
		{/if}
	</main>
	{#if !finished}
		<footer class="foot">
			<div class="foot-in">
				{#if shown}
					<div class="rates">
						{#each RATINGS as r, i (r)}
							<button type="button" data-rate={r} style:--tone="var({TONE[r]})" onclick={() => rate(r)}>
								<span>{tx(LABEL[r])}</span><small>{next[i]}</small><span class="corner"><RateMark rating={r} size={12} /></span>
							</button>
						{/each}
					</div>
				{/if}
				<p class="counts">
					<span class="n" use:tip={{ text: tx("rvCountNew"), side: "top" }}>{counts.new}</span>
					<span class="l" use:tip={{ text: tx("rvCountLearning"), side: "top" }}>{counts.learning}</span>
					<span class="r" use:tip={{ text: tx("rvCountReview"), side: "top" }}>{counts.review}</span>
				</p>
			</div>
		</footer>
	{/if}
{/if}

<style>
.progress {
	flex: 1;
	display: flex;
	align-items: center;
	max-width: 360px;
}
.track {
	flex: 1;
	height: 4px;
	border-radius: 4px;
	background: var(--line-soft);
	overflow: hidden;
}
.track i {
	display: block;
	height: 100%;
	background: var(--accent-c);
	border-radius: 4px;
	transition: width 0.35s var(--ease-panel);
}
.wrap {
	width: min(640px, 100% - 32px);
	margin: 0 auto;
	padding: clamp(24px, 9vh, 90px) 0 180px;
}
/* The card in hand: paper on the desk, nothing printed on it but the card's own words. */
.study {
	position: relative;
	padding: 26px 26px 22px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	box-shadow: var(--paper-lift);
}
:global(html[data-vt$=">/review"]) .study,
:global(html[data-vt^="/review>"]) .study {
	view-transition-name: review;
}
.study.in {
	animation: card-in 250ms var(--ease-panel);
}
@keyframes card-in {
	from {
		opacity: 0;
		transform: translateY(8px);
	}
}
.face {
	margin-bottom: 20px;
}
.part {
	background: color-mix(in srgb, #f2c94c 45%, transparent);
	color: inherit;
	border-radius: 3px;
	padding: 0 2px;
	box-decoration-break: clone;
}
:global([data-theme="dark"]) .part {
	background: color-mix(in srgb, #c9a227 38%, transparent);
}
.part.ok {
	background: color-mix(in srgb, var(--ok) 18%, transparent);
}
/* What they wrote that differs: struck in red; what it should be: underlined in green, both inside the marked part. */
.part del {
	color: var(--bad);
	text-decoration: line-through;
	text-decoration-thickness: 1.5px;
}
.part ins {
	text-decoration: underline;
	text-decoration-color: var(--ok);
	text-decoration-thickness: 2px;
	text-underline-offset: 4px;
	color: var(--ink);
}
.answer {
	position: relative;
	display: flex;
	align-items: center;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--bg);
	transition:
		border-color 150ms,
		box-shadow 150ms;
}
.answer:focus-within {
	border-color: color-mix(in srgb, var(--ink) 40%, transparent);
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 50%, transparent);
}
.answer input {
	flex: 1;
	min-width: 0;
	height: 50px;
	padding: 0 6px 0 16px;
	border: 0;
	background: none;
	color: var(--ink);
	font: 19px var(--font-serif-stack);
	outline: 0;
}
.answer input::placeholder {
	color: var(--muted);
	font-family: var(--font-sans-stack);
	font-size: 15px;
}
.tools {
	display: flex;
	gap: 2px;
	padding-inline-end: 6px;
}
.tools button {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: 6px;
	background: none;
	color: var(--muted);
	cursor: pointer;
	transition:
		color 150ms,
		background-color 150ms,
		scale 150ms;
}
.tools button:hover {
	color: var(--ink);
	background: var(--hover);
}
.tools button:active {
	scale: 0.97;
}
.tools button:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.tools .go {
	background: var(--ink);
	color: var(--bg);
}
.tools .go:hover {
	background: color-mix(in srgb, var(--ink) 86%, var(--bg));
	color: var(--bg);
}
.back {
	animation: card-in 250ms var(--ease-panel);
}
.why {
	margin: 0;
	padding-top: 14px;
	border-top: 1px solid var(--line-soft);
	color: var(--ink-2);
	font-size: 15px;
	line-height: 1.55;
}
.foot {
	position: fixed;
	inset: auto 0 0;
	z-index: 5;
	padding: 10px max(16px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
	background: color-mix(in srgb, var(--bg) 94%, transparent);
	border-top: 1px solid var(--line-soft);
	backdrop-filter: blur(8px);
}
.foot-in {
	width: min(640px, 100%);
	margin: 0 auto;
}
.rates {
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 8px;
	margin-bottom: 8px;
	animation: card-in 200ms var(--ease-panel);
}
/* Anki's four as divider cards, each with its coloured tab. */
.rates button {
	position: relative;
	display: grid;
	gap: 1px;
	justify-items: center;
	align-content: center;
	height: 54px;
	border-radius: 5px;
	border: 1px solid var(--edge);
	border-top: 4px solid var(--tone);
	background: var(--raised);
	box-shadow: var(--paper-lift);
	color: var(--ink);
	cursor: pointer;
	font-size: 14.5px;
	font-weight: 600;
	transition:
		translate 150ms var(--ease-panel),
		box-shadow 150ms;
}
.rates button:hover {
	translate: 0 -2px;
	box-shadow: var(--paper-lift-hi);
}
.rates button:active {
	translate: 0 1px;
}
.rates button:focus-visible {
	outline: none;
	box-shadow:
		var(--paper-lift),
		0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
/* The rating's mark sits in the corner, off the centred label: it is what the summary shows for this rating. */
.rates .corner {
	position: absolute;
	right: 6px;
	bottom: 5px;
	display: flex;
}
.rates small {
	color: var(--muted);
	font-size: 12.5px;
	font-weight: 400;
	font-variant-numeric: tabular-nums;
}
.counts {
	display: flex;
	justify-content: center;
	gap: 14px;
	margin: 0;
	font: 600 15px / 1.6 var(--font-sans-stack);
	font-variant-numeric: tabular-nums;
}
.counts span {
	min-width: 1.2em;
	text-align: center;
	cursor: default;
}
.counts .n {
	color: var(--cool);
}
.counts .l {
	color: var(--bad);
}
.counts .r {
	color: var(--ok);
}
.summary h1 {
	font-size: 30px;
	margin: 0 0 18px;
}
.stats {
	display: flex;
	gap: 36px;
	margin-bottom: 22px;
}
.stats div {
	display: grid;
}
.stats b {
	font: 400 34px / 1.1 var(--font-serif-stack);
	font-variant-numeric: tabular-nums;
}
.stats span {
	color: var(--muted);
	font-size: 13px;
}
.went {
	list-style: none;
	margin: 0 0 22px;
	padding: 0;
	border-top: 1px solid var(--line-soft);
}
.went li {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 14px;
	padding: 10px 0;
	border-bottom: 1px solid var(--line-soft);
}
.said {
	font: 17px / 1.45 var(--font-serif-stack);
}
.trail {
	display: flex;
	gap: 2px;
	flex: none;
}
.tipped {
	display: inline-flex;
}
</style>
