<script lang="ts">
import { blur } from "svelte/transition";
import { app } from "#lib/account/app.svelte.ts";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import Select from "#lib/components/common/Select.svelte";
import ScenarioCard from "#lib/components/home/ScenarioCard.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import { hasScenarios } from "#lib/constants.ts";
import { nameOf, tx } from "#lib/i18n/tx.ts";
import { library } from "#lib/scenario/scenario.remote.ts";
import type { ScenarioCard as Card } from "#lib/scenario/types.ts";
import { dateOfDay } from "#lib/time/clock.svelte.ts";
import { siteOf } from "#lib/writing/sites.ts";

/*
 * The prompts: this month's issue (a themed handful the admin publishes on a date), then the evergreen pool, which
 * has no schedule and is ranked by code ("for you": not written yet first, places taking turns, newer first), then the
 * back issues. A place filter and a time filter narrow the pool.
 */
const lib = $derived(hasScenarios(app.lang) ? await library(app.lang) : { pool: [], past: [] });
const issue = $derived(lib.issue);
let sort = $state("for");
let place = $state("all");
let time = $state("any");
const places = $derived([...new Set(lib.pool.map((q) => q.site))]);
// The pool comes ranked for this learner; "newest" is the same list by when each was published.
const shown = $derived.by(() => {
	const list = lib.pool.filter(
		(q) => (place === "all" || q.site === place) && (time === "any" || (time === "short" ? q.minutes <= 8 : q.minutes > 8)),
	);
	return sort === "for" ? list : [...list].sort((a, b) => b.publishedAt - a.publishedAt);
});
const dateOf = (d: string) => dateOfDay(d, { month: "long", day: "numeric" });
const metaOf = (q: Card) =>
	q.state === "written" ? tx("scenarioWritten") : q.state === "open" ? tx("scenarioActive") : tx("aboutMin", { m: q.minutes });
$effect(() => {
	document.title = `${tx("navLibrary")} · ${tx("homeTitle")}`;
});
</script>

<main class="lib">
	<h1>{tx("navLibrary")}</h1>

	{#if !hasScenarios(app.lang)}
		<EmptyState
			art="clink"
			title={tx("libNoneTitle", { lang: nameOf(app.lang) })}
			body={tx("libNoneBody")}
			action={{ label: tx("navNew"), href: "/" }}
		/>
	{:else}
		{#if issue}
			<section class="issue" style:--tone={issue.tone} style:--deep={issue.deep} aria-labelledby="issue-h">
				<div class="masthead">
					<span class="kicker">{tx("libIssue")} · {dateOf(issue.date)}</span>
					<h2 id="issue-h">{issue.title}</h2>
					<p>{issue.line}</p>
				</div>
				<div class="grid">
					{#each issue.scenarios as q (q.id)}
						<ScenarioCard compact site={q.site} title={q.title} line={q.line} meta={metaOf(q)} state={q.state} href="/scenario/{q.id}" />
					{/each}
				</div>
			</section>
		{/if}

		<section aria-labelledby="pool-h">
			<div class="head">
				<h2 id="pool-h">{tx("libPool")}</h2>
				<span class="grow"></span>
				<SegmentedControl
					label={tx("libSort")}
					size="sm"
					bind:value={sort}
					items={[
						{ value: "for", label: tx("libSortFor") },
						{ value: "new", label: tx("libSortNew") },
					]}
				/>
			</div>
			<div class="filters">
				<Select
					variant="ghost"
					size="sm"
					aria-label={tx("libPlace")}
					bind:value={place}
					items={[{ value: "all", label: tx("libAllPlaces") }, ...places.map((p) => ({ value: p, label: p }))]}
				/>
				<Select
					variant="ghost"
					size="sm"
					aria-label={tx("libTime")}
					bind:value={time}
					items={[
						{ value: "any", label: tx("libAnyTime") },
						{ value: "short", label: tx("libShort") },
						{ value: "long", label: tx("libLong") },
					]}
				/>
			</div>
			<div class="stack">
				{#key `${sort}|${place}|${time}`}
					<div class="layer" in:blur={{ duration: 220, delay: 90, amount: 2 }} out:blur={{ duration: 100, amount: 2 }}>
						{#if shown.length}
							<div class="grid">
								{#each shown as q (q.id)}
									<ScenarioCard site={q.site} title={q.title} line={q.line} meta={metaOf(q)} state={q.state} href="/scenario/{q.id}" />
								{/each}
							</div>
						{:else}
							<p class="none">{tx("libNoMatch")}</p>
						{/if}
					</div>
				{/key}
			</div>
		</section>

		{#if lib.past.length}
			<section class="past" aria-labelledby="past-h">
				<h2 id="past-h">{tx("libPast")}</h2>
				<ul>
					{#each lib.past as i (i.id)}
						<li style:--tone={i.tone} style:--deep={i.deep}>
							<span class="spine" aria-hidden="true"></span>
							<div class="main">
								<div class="t">{i.title} <span class="d">{dateOf(i.date)}</span></div>
								<div class="links">
									{#each i.scenarios as q (q.id)}
										<a href="/scenario/{q.id}" style:--dot={siteOf(q.site).tone}>{q.title}</a>
									{/each}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</main>

<style>
.lib {
	width: min(1080px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(16px, 5vh, 48px) 0 96px;
}
h1 {
	margin-bottom: 6px;
}
/* The issue: a magazine masthead in its own colour, its few scenarios below it. */
.issue {
	margin-bottom: 44px;
	padding: 22px 22px 22px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--tone) 45%, var(--bg));
	border: 1px solid var(--edge);
}
:global([data-theme="dark"]) .issue {
	background: color-mix(in srgb, var(--deep) 55%, var(--bg));
}
.masthead {
	margin-bottom: 18px;
}
.kicker {
	font-size: 12.5px;
	color: var(--ink-2);
}
.masthead h2 {
	font-size: 30px;
	margin: 2px 0 4px;
}
.masthead p {
	margin: 0;
	color: var(--ink-2);
}
.head {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 6px;
}
.grow {
	flex: 1;
}
.filters {
	display: flex;
	gap: 4px;
	margin: 0 0 12px -10px;
}
.grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 14px;
}
@media (max-width: 1180px) and (min-width: 641px) {
	.grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
@media (max-width: 640px) {
	.grid {
		grid-template-columns: 1fr;
		gap: 10px;
	}
	.issue {
		padding: 18px 14px 14px;
	}
}
/* Holds about a row of cards, so a filter that empties the list does not pull what follows up with a jump. */
.stack {
	display: grid;
	min-height: 300px;
}
.layer {
	grid-area: 1 / 1;
	min-width: 0;
}
.none {
	padding: 40px 0;
	text-align: center;
	color: var(--muted);
}
.past {
	margin-top: 48px;
}
.past h2 {
	margin-bottom: 12px;
}
.past ul {
	list-style: none;
	margin: 0;
	padding: 0;
	border-top: 1px solid var(--line-soft);
}
.past li {
	display: flex;
	gap: 14px;
	padding: 14px 4px;
	border-bottom: 1px solid var(--line-soft);
}
/* A back issue on the shelf: a spine in its colour. */
.spine {
	width: 10px;
	flex: none;
	border-radius: 3px;
	background: var(--tone);
}
:global([data-theme="dark"]) .spine {
	background: var(--deep);
}
.main {
	min-width: 0;
}
.t {
	font-weight: 600;
}
.d {
	margin-inline-start: 6px;
	font-weight: 400;
	font-size: 13px;
	color: var(--muted);
}
.links {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 16px;
	margin-top: 4px;
}
.links a {
	color: var(--ink-2);
	font-size: 13.5px;
	text-decoration: underline;
	text-underline-offset: 3px;
	text-decoration-color: var(--line);
	transition: color 150ms;
}
.links a:hover {
	color: var(--ink);
	text-decoration-color: currentColor;
}
</style>
