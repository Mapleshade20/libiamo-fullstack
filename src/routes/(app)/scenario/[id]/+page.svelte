<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import { app } from "#lib/account/app.svelte.ts";
import Accordion from "#lib/components/common/Accordion.svelte";
import { autogrow } from "#lib/components/common/motion.ts";
import Situation from "#lib/components/scenario/Situation.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import { sandboxed } from "#lib/components/tour/sandbox.svelte.ts";
import { tourScenario } from "#lib/components/tour/scenarios.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { tx } from "#lib/i18n/tx.ts";
import { notesNow } from "#lib/notebook/notebook.svelte.ts";
import { keepPlan, plan as planOf, scenarioView } from "#lib/scenario/scenario.remote.ts";
import { reopen } from "#lib/writing/open.ts";
import { siteOf } from "#lib/writing/sites.ts";
import { myWriting } from "#lib/writing/writing.svelte.ts";
import { beforeNavigate, goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * Before a scenario: everything the learner should carry into the simulation, on one page. Who they are there, who else
 * is there, what they want out of it (the main app's objectives), and how it starts, shown in the place's own look.
 * Then a moment to prepare: phrases from their own notebook that could fit, and a plan in their own words (planning
 * before a task makes what follows more fluent and more ambitious); the session afterwards reads the plan as their
 * notes. The button opens the place: the simulated surface, or for a translation, the sheet it is written on. The plan
 * is kept on the server as it is typed, and the piece takes it when it is created.
 */
const where = $derived({ id: page.params.id ?? "", lang: app.lang });
const scenario = $derived(sandboxed() ? tourScenario(where.id, where.lang) : await scenarioView(where));
const s = $derived(scenario?.situation);
const sim = $derived(scenario?.scene);
const st = $derived(scenario ? siteOf(scenario.site) : undefined);
const progress = $derived(scenario?.state ?? "new");
const started = $derived(scenario?.openPiece ? myWriting().find((w) => w.id === scenario.openPiece) : undefined);
const written = $derived(scenario?.writtenPiece);
// Phrases the learner already owns that could serve here: their notebook's latest few (phase 4 ranks them by fit).
const owned = $derived((await notesNow()).slice(0, 4).map((n) => n.phrase));
// The tour's plan stays on the page.
let plan = $derived(sandboxed() ? "" : await planOf(where));
let pending: (() => Promise<unknown>) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
function typed(text: string) {
	plan = text;
	if (sandboxed()) return;
	const at = where;
	clearTimeout(timer);
	pending = () => keepPlan({ ...at, text }).catch(() => {});
	timer = setTimeout(flush, 500);
}
function flush() {
	clearTimeout(timer);
	const send = pending;
	pending = null;
	return send?.();
}
// Going in waits for the plan just typed: the piece takes it.
beforeNavigate(({ to }) => {
	if (pending && !to?.url.pathname.startsWith(`/scenario/${where.id}/`)) flush();
});
async function goIn(e: MouseEvent, href: string) {
	e.preventDefault();
	await flush();
	goto(href);
}
const translation = $derived(scenario?.kind === "translation");
const enter = $derived(translation ? tx("qEnterTr") : tx("qEnter", { site: scenario?.site ?? "" }));
$effect(() => {
	document.title = `${scenario?.title ?? tx("navLibrary")} · ${tx("homeTitle")}`;
});
</script>

{#if !scenario || !s || !st}
	<main class="scenario"><EmptyState art="clink" title={tx("qMissing")} action={{ label: tx("shelfAll"), href: "/library" }} /></main>
{:else}
	<main class="scenario" style:--tone={st.tone} style:--deep={st.deep}>
		<a class="back" href="/library"><ArrowLeft class="size-4" aria-hidden="true" />{tx("shelfAll")}</a>
		<header>
			<p class="meta">
				<span class="place">{scenario.site}</span><span>{tx("aboutMin", { m: scenario.minutes })}</span>
				{#if progress === "open"}
					<span class="on">{tx("scenarioActive")}</span>
				{:else if progress === "written"}
					<span>{tx("scenarioWritten")}</span>
				{/if}
			</p>
			<h1>{scenario.title}</h1>
			<p class="line">{scenario.line}</p>
			<!-- What a newcomer would not know (the game, what happened before); most scenarios have none. -->
			{#if !translation && scenario.introduction}
				<p class="intro" lang={app.lang}>{scenario.introduction}</p>
			{/if}
		</header>

		<div class="cols">
			<div class="main">
				{#if sim}
					<section class="scene" aria-labelledby="scene-h">
						<h2 id="scene-h" class="label">{tx("qScene")}</h2>
						<dl>
							<div>
								<dt>{tx("qYou")}</dt>
								<dd>{sim.you}</dd>
							</div>
							<div>
								<dt>{tx("qThere")}</dt>
								<dd class="cast">
									{#each sim.people as c}
										<span class="person"
											><span class="avatar" aria-hidden="true">{c.name.replace(/^u\//, "").slice(0, 1).toUpperCase()}</span
											><span><b>{c.name}</b> <small>{c.who}</small></span></span
										>
									{/each}
								</dd>
							</div>
							<div>
								<dt>{tx("qGoals")}</dt>
								<dd>
									<ul class="goals">
										{#each sim.goals as g}
											<li>{g}</li>
										{/each}
									</ul>
								</dd>
							</div>
						</dl>
					</section>
				{/if}

				<section aria-labelledby="sit-h">
					<h2 id="sit-h" class="label">{tx(translation ? "qToTranslate" : "qStarts")}</h2>
					<div class="paper"><Situation {s} lang={scenario.situationLang} /></div>
				</section>
			</div>

			<aside class="prep" aria-labelledby="prep-h">
				<h2 id="prep-h" class="label">{tx("qPrep")}</h2>
				<!-- A notebook with nothing in it yet has nothing to offer here: the plan comes first, open. -->
				{#if owned.length}
					<Accordion title={tx("qOwned")} open>
						<div class="chips">
							{#each owned as p}
								<span class="chip">{p}</span>
							{/each}
						</div>
					</Accordion>
				{/if}
				<Accordion title={tx("qPlan")} class={owned.length ? "mt-2" : ""} open={!owned.length || !!plan.trim()}>
					<textarea
						value={plan}
						use:autogrow={plan}
						oninput={(e) => typed(e.currentTarget.value)}
						rows="3"
						placeholder={tx("qPlanPh")}
						aria-label={tx("qPlan")}
					></textarea>
				</Accordion>

				<div class="go">
					{#if started}
						<Button class="w-full" onclick={() => reopen(started)}>{tx("qContinue")}<ArrowRight aria-hidden="true" /></Button>
					{:else}
						{@const href = `/scenario/${scenario.id}/${translation ? "translate" : "play"}`}
						<Button class="w-full" {href} onclick={(e: MouseEvent) => goIn(e, href)}>{enter}<ArrowRight aria-hidden="true" /></Button>
					{/if}
					{#if written}
						<a class="seen" href="/w/{written}">{tx("qSeeIt")}</a>
					{/if}
				</div>
			</aside>
		</div>
	</main>
{/if}

<style>
.scenario {
	width: min(1080px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(8px, 3vh, 28px) 0 96px;
}
.back {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin: 0 0 18px -8px;
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
	margin-bottom: 26px;
}
h1 {
	font-size: clamp(28px, 3.6vw, 36px);
	margin: 8px 0 6px;
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
.on {
	color: var(--ink);
}
.line {
	margin: 0;
	font-size: 16px;
	color: var(--ink-2);
}
.intro {
	max-width: 40rem;
	margin: 12px 0 0;
	padding-left: 12px;
	border-left: 2px solid color-mix(in srgb, var(--tone) 70%, var(--line));
	color: var(--ink-2);
	font-size: 14.5px;
	line-height: 1.6;
}
.cols {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
	gap: 28px;
	align-items: start;
}
@media (max-width: 900px) {
	.cols {
		grid-template-columns: 1fr;
	}
}
.main {
	display: grid;
	gap: 26px;
	min-width: 0;
}
.label {
	display: flex;
	align-items: center;
	margin: 0 0 8px;
	font: 500 13px / 1.4 var(--font-sans-stack);
	letter-spacing: 0;
	color: var(--muted);
}
/* The scene: three short facts, as a playbill lists them. */
.scene dl {
	display: grid;
	margin: 0;
	border-top: 1px solid var(--line-soft);
}
.scene dl > div {
	display: grid;
	grid-template-columns: 9em minmax(0, 1fr);
	gap: 12px;
	padding: 12px 2px;
	border-bottom: 1px solid var(--line-soft);
}
@media (max-width: 640px) {
	.scene dl > div {
		grid-template-columns: 1fr;
		gap: 4px;
	}
}
dt {
	font-size: 13.5px;
	color: var(--muted);
}
dd {
	margin: 0;
	font-size: 15px;
}
.cast {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 18px;
}
.person {
	display: inline-flex;
	align-items: center;
	gap: 8px;
}
.person small {
	color: var(--muted);
	font-size: 13px;
}
.avatar {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	flex: none;
	border-radius: 50%;
	background: color-mix(in srgb, var(--tone) 70%, var(--raised));
	font-size: 12.5px;
	font-weight: 600;
	color: #3d3d3a;
}
:global([data-theme="dark"]) .avatar {
	background: var(--deep);
	color: var(--ink);
}
.goals {
	list-style: disc;
	margin: 0;
	padding-inline-start: 18px;
}
.goals li + li {
	margin-top: 2px;
}
.paper {
	padding: 20px 22px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--line);
	box-shadow: var(--shadow);
}
.prep {
	position: sticky;
	top: 16px;
	padding: 18px;
	border-radius: 6px;
	background: var(--card-bg);
	border: 1px solid var(--edge);
}
@media (max-width: 900px) {
	.prep {
		position: static;
	}
}
.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.chip {
	padding: 3px 10px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	font: 14px / 1.5 var(--font-serif-stack);
}
textarea {
	display: block;
	width: 100%;
	resize: none;
	border: 1px solid transparent;
	border-radius: 6px;
	padding: 8px 10px;
	background: var(--raised);
	color: var(--ink);
	font: 14.5px / 1.6 var(--font-sans-stack);
	transition: border-color 150ms;
}
textarea:focus {
	outline: 0;
	border-color: color-mix(in srgb, var(--ink) 25%, transparent);
}
textarea::placeholder {
	color: var(--muted);
}
.go {
	display: grid;
	gap: 10px;
	justify-items: center;
	margin-top: 18px;
}
.seen {
	font-size: 13px;
	color: var(--muted);
}
</style>
