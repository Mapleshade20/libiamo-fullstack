<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import Copy from "@lucide/svelte/icons/copy";
import ExternalLink from "@lucide/svelte/icons/external-link";
import { diffWords } from "diff";
import { app } from "#lib/account/app.svelte.ts";
import { revalidate } from "#lib/client/refresh.ts";
import Accordion from "#lib/components/common/Accordion.svelte";
import InfoTip from "#lib/components/common/InfoTip.svelte";
import LoadingReveal from "#lib/components/common/LoadingReveal.svelte";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import { sandboxed, tourPiece } from "#lib/components/tour/sandbox.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { tx } from "#lib/i18n/tx.ts";
import { dateAt } from "#lib/time/clock.svelte.ts";
import { siteOf } from "#lib/writing/sites.ts";
import { notesPending, type Posted } from "#lib/writing/types.ts";
import { pieceById, takeUpPiece } from "#lib/writing/writing.remote.ts";
import { refreshWriting, setPosted } from "#lib/writing/writing.svelte.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * A finished piece's own page: what the session becomes when it ends, and what My writing and the sidebar open later.
 * In the order the learner wants things: the text, ready to post (the changes one switch away); the reader's reaction;
 * what they worked out, theirs marked apart from what was given, at most four, already in the notebook; what is still
 * worth a look, folded; and what next.
 */
const id = $derived(page.params.id ?? "");
// The tour's piece lives in its sandbox; every other is the server's.
revalidate(sandboxed() ? null : pieceById(page.params.id ?? ""));
const w = $derived(sandboxed() ? tourPiece(id) : await pieceById(id));
const r = $derived(w?.result);
const st = $derived(siteOf(w?.site));
const scenario = $derived(w?.scenarioId ? { id: w.scenarioId } : undefined);
// A scenario's piece was already sent in the simulation: the page shows how the thread took it, and the revision is
// for next time rather than for posting.
const sim = $derived(w?.scenarioId && r?.ending ? { ending: r.ending } : undefined);
let view = $state("final");
const parts = $derived(r ? diffWords(r.original, r.final) : []);
const learned = $derived(r ? [...r.learned].sort((a, b) => Number(b.own) - Number(a.own)).slice(0, 4) : []);
// The entries are chosen a few seconds after the session ends: rows wait in grey until they come. The page looks again
// every two seconds; two minutes on, what pass 2 reworked stands while the server tries again (it files that if it
// cannot), and the page looks now and then.
const pending = $derived(notesPending(r));
$effect(() => {
	if (sandboxed() || !r?.notesPending) return;
	const piece = id;
	const t = setTimeout(
		async () => {
			await pieceById(piece).refresh();
			// Filed: the notebook and the lists have them too.
			if (!pieceById(piece).current?.notesPending) refreshWriting();
		},
		pending ? 2000 : 30_000,
	);
	return () => clearTimeout(t);
});
const OPEN: Record<string, string> = {
	AO3: "https://archiveofourown.org",
	Reddit: "https://www.reddit.com",
	Discord: "https://discord.com/app",
	Email: "mailto:",
	iMessage: "sms:",
};
const openHref = $derived(w ? OPEN[Object.keys(OPEN).find((k) => w.site.includes(k)) ?? ""] : undefined);
function copy() {
	if (!r) return;
	navigator.clipboard?.writeText(r.final).then(() => toast(tx("copied")));
}
// Taking it up again goes where it was before its revision; the server says where.
let taking = $state(false);
async function takeUp() {
	if (!w || taking) return;
	taking = true;
	const to = await takeUpPiece(w.id)
		.then((r) => r?.to)
		.catch(() => undefined);
	if (to) return goto(to);
	taking = false;
	toast(tx("error"));
}
async function posted(v: string) {
	if (!w) return;
	try {
		await setPosted(w.id, v as Posted);
		if (!sandboxed()) await pieceById(w.id).refresh();
		if (v === "yes") toast(tx("pcPostedThanks"));
	} catch {
		toast(tx("error"));
	}
}
$effect(() => {
	document.title = `${w?.title ?? tx("navWriting")} · ${tx("homeTitle")}`;
});
</script>

{#if w?.phase === "abandoned"}
	<!-- Left unfinished and abandoned: what was written, and taking it up again from there (server/writing/take-up.ts). -->
	<main class="piece" style:--tone={st.tone} style:--deep={st.deep}>
		<a class="back" href="/writing"><ArrowLeft class="size-4" aria-hidden="true" />{tx("navWriting")}</a>
		<header>
			<h1>{w.title}</h1>
			<p class="meta">
				{#if w.site}
					<span class="place">{w.site}</span>
				{/if}
				<span>{tx("wrAbandoned")}</span>
			</p>
		</header>
		<p class="gone">{tx("pcAbandonedBody")}</p>
		{#if w.draft}
			<div class="ready draft">{w.draft}</div>
		{/if}
		<Button class="again" onclick={takeUp} disabled={taking}>{tx("pcTakeUp")}<ArrowRight aria-hidden="true" /></Button>
	</main>
{:else if !w || !r}
	<main class="piece">
		<EmptyState art="box" title={tx("pcMissing")} body={tx("pcMissingBody")} action={{ label: tx("navWriting"), href: "/writing" }} />
	</main>
{:else}
	<main class="piece" style:--tone={st.tone} style:--deep={st.deep}>
		<a class="back" href="/writing"><ArrowLeft class="size-4" aria-hidden="true" />{tx("navWriting")}</a>
		<header>
			<h1>{w.title}</h1>
			<p class="meta">
				<span class="place">{w.site}</span><span>{tx("pcRevised", { when: dateAt(r.finishedAt, { month: "short", day: "numeric" }) })}</span>
				{#if w.posted === "yes"}
					<span>{tx("wrPosted")}</span>
				{/if}
				{#if scenario}
					<span><a href="/scenario/{scenario.id}">{tx("pcFromPrompt")}</a></span>
				{/if}
			</p>
		</header>

		<div class="cols">
			<section class="ready" aria-labelledby="ready-h">
				<div class="bar">
					<h2 id="ready-h" class="label">{tx(r.authentic ? "pcYourTranslation" : sim ? "pcRevisedScenario" : "pcReady")}</h2>
					<SegmentedControl
						label={tx("pcView")}
						size="sm"
						bind:value={view}
						items={[
							{ value: "final", label: tx("pcFinal") },
							{ value: "changes", label: tx("pcChanges") },
						]}
					/>
				</div>
				<div class="text">
					<!-- Both views lie in one cell, so switching never moves what is below. -->
					<div class="layer" class:on={view === "final"} aria-hidden={view !== "final"}>{r.final}</div>
					<div class="layer diff" class:on={view === "changes"} aria-hidden={view !== "changes"}>
						{#each parts as p, i}
							{#if p.added}
								<ins>{p.value}</ins>
							{:else if p.removed}
								<del>{p.value}</del>
								{#if parts[i + 1]?.added && !/\s$/.test(p.value)}
									{" "}
								{/if}
							{:else}
								{p.value}
							{/if}
						{/each}
					</div>
				</div>
				<div class="actions">
					<Button onclick={copy}><Copy aria-hidden="true" />{tx("pcCopy")}</Button>
					{#if openHref && !sim}
						<Button variant="secondary" href={openHref} target="_blank" rel="noopener"
							>{tx("pcOpen", { site: w.site })}<ExternalLink aria-hidden="true" /></Button
						>
					{/if}
				</div>
			</section>

			{#if r.authentic}
				<aside class="reader" aria-labelledby="reader-h">
					<h2 id="reader-h" class="label">{tx("pcAuthentic")}</h2>
					<p class="authentic">{r.authentic}</p>
				</aside>
			{:else if sim}
				<aside class="reader" aria-labelledby="reader-h">
					<h2 id="reader-h" class="label">{tx("pcInThread", { site: w.site })}</h2>
					{#each sim.ending as m}
						<p class="said"><b>{m.author}</b> {m.text}</p>
					{/each}
				</aside>
			{:else}
				<aside class="reader" aria-labelledby="reader-h">
					<!-- Not a real reply: how a reader would take the final version, so it says so behind the ⓘ. -->
					<h2 id="reader-h" class="label">
						{tx("pcReader", { name: r.reader })}<InfoTip text={tx("pcReaderNote")} label={tx("pcReader", { name: r.reader })} />
					</h2>
					<blockquote>{r.closing}</blockquote>
				</aside>
			{/if}
		</div>

		{#if learned.length || pending}
			<section class="learned" aria-labelledby="learned-h">
				<h2 id="learned-h">{tx("pcLearned")}</h2>
				<LoadingReveal loading={pending}>
					{#snippet placeholder()}
						<ul class="ghost">
							{#each [0, 1, 2] as i (i)}
								<li><span class="bar" style:width="{[42, 30, 36][i]}%"></span></li>
							{/each}
						</ul>
					{/snippet}
					<ul>
						{#each learned as l}
							<li class:given={!l.own}>
								<div class="main">
									<span class="phrase" lang={w.lang ?? app.lang}>{l.note?.phrase ?? l.text}</span>
									{#if l.was ?? l.before}
										<span class="before" lang={w.lang ?? app.lang}>{tx("pcInstead", { before: l.was ?? l.before ?? "" })}</span>
									{/if}
								</div>
								<span class="tag" class:on={l.own}>{tx(l.own ? "pcOwn" : "pcGiven")}</span>
							</li>
						{/each}
					</ul>
					<p class="foot">{tx("pcNotebook")} <a href="/notebook">{tx("navNotebook")}</a></p>
				</LoadingReveal>
			</section>
		{/if}

		{#if r.leftovers.length}
			<Accordion title={tx("pcLeftovers", { n: r.leftovers.length })} class="mt-6">
				<ul class="left">
					{#each r.leftovers as x}
						<li><b lang={w.lang ?? app.lang}>{x.quote}</b> <span>{x.note}</span></li>
					{/each}
				</ul>
			</Accordion>
		{/if}

		<section class="next" aria-label={tx("pcNext")}>
			<div class="posted">
				{#if !sim}
					<span>{tx("pcAskPosted")}</span>
				{/if}
				{#if !sim}
					<SegmentedControl
						label={tx("pcAskPosted")}
						size="sm"
						value={w.posted ?? ""}
						onValueChange={posted}
						items={[
							{ value: "yes", label: tx("fuYes") },
							{ value: "not-yet", label: tx("fuNotYet") },
							{ value: "no", label: tx("fuNo") },
						]}
					/>
				{:else}
					<!-- Right after a scenario is when another one comes to mind. -->
					<span>{tx("pcSuggestAsk")} <a class="suggest" href="/contribute">{tx("addTitle")}</a></span>
				{/if}
			</div>
			<Button variant="ghost" href="/">{tx("pcNew")}</Button>
		</section>
	</main>
{/if}

<style>
.piece {
	width: min(1080px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(8px, 3vh, 28px) 0 96px;
}
.back {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin: 0 0 10px -8px;
	padding: 6px 8px;
	border-radius: 6px;
	color: var(--muted);
	font-size: 13.5px;
	text-decoration: none;
	transition:
		color 150ms,
		background-color 150ms;
}
.back:hover {
	color: var(--ink);
	background: var(--hover);
}
header {
	margin-bottom: 22px;
}
h1 {
	font-size: clamp(26px, 3.4vw, 34px);
	margin-bottom: 6px;
}
.meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 8px;
	margin: 0;
	font-size: 13px;
	color: var(--muted);
}
.meta > span + span::before {
	content: "·";
	margin-inline-end: 8px;
}
.meta > .place + span::before {
	content: none;
}
.meta a {
	color: var(--ink-2);
}
.place {
	display: inline-block;
	padding: 0 8px;
	border-radius: 6px;
	background: var(--tone);
	color: #3d3d3a;
	font-weight: 500;
}
:global([data-theme="dark"]) .place {
	background: var(--deep);
	color: var(--ink);
}
.gone {
	margin: 0 0 16px;
	color: var(--ink-2);
}
.draft {
	margin-bottom: 18px;
	white-space: pre-wrap;
	font-family: var(--font-serif-stack);
	font-size: 17px;
	line-height: 1.6;
}
.cols {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(240px, 300px);
	gap: 24px;
	align-items: start;
}
@media (max-width: 860px) {
	.cols {
		grid-template-columns: 1fr;
	}
}
.label {
	margin: 0;
	font: 500 13px / 1.4 var(--font-sans-stack);
	letter-spacing: 0;
	color: var(--muted);
}
.ready {
	padding: 16px 20px 18px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--line);
	box-shadow: var(--shadow);
}
.bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 10px;
}
.text {
	display: grid;
}
.layer {
	grid-area: 1 / 1;
	white-space: pre-wrap;
	font: 17px / 1.7 var(--font-serif-stack);
	color: var(--ink);
	opacity: 0;
	visibility: hidden;
	filter: blur(3px);
	transition:
		opacity 150ms var(--ease-panel),
		filter 150ms var(--ease-panel),
		visibility 0s 150ms;
}
.layer.on {
	opacity: 1;
	visibility: visible;
	filter: none;
	transition:
		opacity 250ms var(--ease-panel) 60ms,
		filter 250ms var(--ease-panel) 60ms,
		visibility 0s;
}
.diff ins {
	text-decoration: none;
	background: color-mix(in srgb, var(--ok) 16%, transparent);
	border-radius: 3px;
}
:global([data-theme="dark"]) .diff ins {
	background: color-mix(in srgb, var(--ok) 28%, transparent);
}
.diff del {
	color: var(--muted);
	text-decoration-color: color-mix(in srgb, var(--bad) 60%, transparent);
}
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 16px;
}
.reader {
	padding: 16px 18px;
	border-radius: 6px;
	background: var(--card-bg);
	border: 1px solid var(--edge);
}
.authentic {
	margin: 8px 0 0;
	white-space: pre-line;
	font: 15px / 1.6 var(--font-serif-stack);
}
blockquote {
	margin: 8px 0 0;
	font: italic 16px / 1.6 var(--font-serif-stack);
	color: var(--ink);
}
.said {
	margin: 8px 0 0;
	font-size: 14.5px;
	line-height: 1.55;
}
.said b {
	display: block;
	font-size: 12.5px;
	color: var(--ink-2);
}
.learned {
	margin-top: 36px;
}
.learned h2 {
	margin-bottom: 10px;
}
.learned ul {
	list-style: none;
	margin: 0;
	padding: 0;
	border-top: 1px solid var(--line-soft);
}
.learned li {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 12px 4px;
	border-bottom: 1px solid var(--line-soft);
}
.learned .main {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}
.phrase {
	font: 18px / 1.4 var(--font-serif-stack);
}
/* A row while the entries are on their way: the height of a phrase and its line below. */
.ghost li {
	height: 70px;
}
.ghost .bar {
	height: 14px;
	border-radius: 4px;
	background: var(--well);
}
.given .phrase {
	color: var(--ink-2);
}
.before {
	font-size: 13px;
	color: var(--muted);
}
.foot {
	margin: 10px 4px 0;
	font-size: 13px;
	color: var(--muted);
}
.foot a {
	color: var(--ink-2);
}
.left {
	margin: 0;
	padding: 0 0 0 18px;
	font-size: 14px;
	color: var(--ink-2);
}
.left li + li {
	margin-top: 6px;
}
.left span {
	color: var(--muted);
}
.next {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-top: 36px;
	padding-top: 18px;
	border-top: 1px solid var(--line-soft);
}
.suggest {
	color: var(--ink);
	text-decoration: underline;
	text-decoration-color: var(--line);
	text-underline-offset: 3px;
	transition: text-decoration-color 150ms;
}
.suggest:hover {
	text-decoration-color: var(--ink);
}
.posted {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	font-size: 14px;
	color: var(--ink-2);
}
</style>
