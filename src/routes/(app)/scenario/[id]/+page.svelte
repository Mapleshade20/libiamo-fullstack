<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import Languages from "@lucide/svelte/icons/languages";
import Accordion from "#lib/components/common/Accordion.svelte";
import { autogrow } from "#lib/components/common/motion.ts";
import Situation from "#lib/components/scenario/Situation.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { app, demoOpens, read, tx, write } from "#lib/demo/app.svelte.ts";
import { myWriting, reviewDeck, siteOf } from "#lib/demo/data.ts";
import { reopen } from "#lib/demo/reopen.ts";
import { SIMS, scenarioById, scenarioState, situationOf } from "#lib/demo/scenarios.ts";
import { page } from "$app/state";

/*
 * Before a scenario: everything the learner should carry into the simulation, on one page. Who they are there, who else
 * is there, what they want out of it (the main app's objectives), and how it starts, shown in the place's own look.
 * Then a moment to prepare: phrases from their own notebook that could fit, and a plan in their own words (planning
 * before a task makes what follows more fluent and more ambitious); the session afterwards reads the plan as their
 * notes. The button opens the place: the main app's simulated surface (in the demo, a placeholder for it), or for a
 * translation, the sheet it is written on.
 */
const scenario = $derived(scenarioById(page.params.id ?? ""));
const s = $derived(scenario ? situationOf(scenario) : undefined);
const sim = $derived(scenario ? SIMS[scenario.id] : undefined);
const st = $derived(scenario ? siteOf(scenario.site) : undefined);
const progress = $derived(scenario ? scenarioState(scenario.id) : "new");
const started = $derived(scenario ? myWriting().find((w) => w.scenarioId === scenario.id && w.open) : undefined);
const written = $derived(scenario ? myWriting().find((w) => w.scenarioId === scenario.id && w.result) : undefined);
// Phrases the learner already owns that could serve here: their notebook's, a few (the main app would rank by fit).
const owned = $derived(
	reviewDeck()
		.slice(0, 4)
		.map((c) => c.phrase ?? c.answer),
);
const planKey = $derived(`scenarioPlan:${page.params.id}`);
let plan = $state("");
$effect(() => {
	plan = read<string>(planKey, "");
});
const savePlan = () => write(planKey, plan);
const enter = $derived(scenario?.site === "Translate" ? tx("qEnterTr") : tx("qEnter", { site: scenario?.site ?? "" }));
$effect(() => {
	document.title = `${scenario?.title[app.lang] ?? tx("navLibrary")} · ${tx("homeTitle")}`;
});
</script>

{#if !scenario || !s || !st}
	<main class="scenario"><EmptyState art="clink" title={tx("qMissing")} action={{ label: tx("shelfAll"), href: "/library" }} /></main>
{:else}
	<main class="scenario" style:--tone={st.tone} style:--deep={st.deep}>
		<a class="back" href="/library"><ArrowLeft class="size-4" aria-hidden="true" />{tx("shelfAll")}</a>
		<header>
			<p class="meta">
				<span class="place">{scenario.site}</span><span>{tx("aboutMin", { m: scenario.min })}</span>
				{#if progress === "open"}
					<span class="on">{tx("scenarioActive")}</span>
				{:else if progress === "written"}
					<span>{tx("scenarioWritten")}</span>
				{/if}
			</p>
			<h1>{scenario.title[app.lang]}</h1>
			<p class="line">{scenario.line[app.lang]}</p>
			<!-- What a newcomer would not know (the game, what happened before); most scenarios have none. -->
			{#if scenario.site !== "Translate" && scenario.brief[app.lang]}
				<p class="intro" lang={app.lang}>{scenario.brief[app.lang]}</p>
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
									{#each sim.cast as c}
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
					<h2 id="sit-h" class="label">{tx(scenario.site === "Translate" ? "qToTranslate" : "qStarts")}</h2>
					<div class="paper"><Situation {s} lang={s.kind === "translate" ? s.sourceLang : app.lang} /></div>
				</section>
			</div>

			<aside class="prep" aria-labelledby="prep-h">
				<h2 id="prep-h" class="label">{tx("qPrep")}</h2>
				<Accordion title={tx("qOwned")} open>
					<div class="chips">
						{#each owned as p}
							<span class="chip">{p}</span>
						{/each}
					</div>
				</Accordion>
				<Accordion title={tx("qPlan")} class="mt-2">
					<textarea bind:value={plan} use:autogrow={plan} oninput={savePlan} rows="3" placeholder={tx("qPlanPh")} aria-label={tx("qPlan")}></textarea>
					<Button variant="ghost" size="sm" class="mt-1 -ms-2 text-muted-foreground" onclick={demoOpens}
						><Languages aria-hidden="true" />{tx("qHowSay")}</Button
					>
				</Accordion>

				<div class="go">
					{#if started}
						<Button class="w-full" onclick={() => reopen(started)}>{tx("qContinue")}<ArrowRight aria-hidden="true" /></Button>
					{:else}
						<Button class="w-full" href="/scenario/{scenario.id}/{scenario.site === "Translate" ? "translate" : "play"}"
							>{enter}<ArrowRight aria-hidden="true" /></Button
						>
					{/if}
					{#if written}
						<a class="seen" href="/w/{written.id}">{tx("qSeeIt")}</a>
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
