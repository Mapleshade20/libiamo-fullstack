<script lang="ts">
import Plus from "@lucide/svelte/icons/plus";
import Button from "$lib/components/ui/button/button.svelte";
import { adminIssues, fmtDay, issueState } from "$lib/demo/admin";
import { scenarioById } from "$lib/demo/scenarios";

/*
 * Issues: an occasional themed handful of scenarios with a date, shown first on the shelf for about a month, then
 * part of the pool. What replaced the main app's daily and weekly lineups; the pool itself needs no schedule.
 */
const issues = adminIssues().toSorted((a, b) => b.date.localeCompare(a.date));
const LABEL = { scheduled: "Scheduled", current: "On the shelf", past: "In the pool" } as const;
</script>

<div class="adm-page">
	<header class="adm-head">
		<h1>Issues</h1>
		<div class="acts">
			<Button href="/admin/issues/new"><Plus aria-hidden="true" />New issue</Button>
		</div>
	</header>
	<ul class="issues">
		{#each issues as i (i.id)}
			{@const state = issueState(i.date)}
			<li>
				<a class="issue" href="/admin/issues/{i.id}" class:past={state === "past"} style:--tone={i.tone} style:--deep={i.deep}>
					<span class="band" aria-hidden="true"
						><span class="d">{new Date(i.date).toLocaleDateString("en-GB", { month: "short" })}</span
						><span class="y">{new Date(i.date).getFullYear()}</span></span
					>
					<span class="body">
						<span class="t">{i.title.en}</span>
						<span class="s">{i.line.en}</span>
						<span class="list"
							>{i.scenarios
								.map((id) => scenarioById(id)?.title.en)
								.filter(Boolean)
								.join(" · ")}</span
						>
					</span>
					<span class="side">
						<span class="adm-tag" class:ok={state === "current"}>{LABEL[state]}</span>
						<span class="adm-meta">{fmtDay(i.date)}</span>
					</span>
				</a>
			</li>
		{/each}
	</ul>
</div>

<style>
.issues {
	display: grid;
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.issue {
	display: flex;
	align-items: stretch;
	min-height: 104px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--raised);
	box-shadow: var(--paper-lift);
	color: inherit;
	text-decoration: none;
	overflow: hidden;
	transition:
		box-shadow 250ms var(--ease-panel),
		translate 250ms var(--ease-panel);
}
.issue:hover {
	box-shadow: var(--paper-lift-hi);
	translate: 0 -1px;
}
.issue:focus-visible {
	outline: none;
	box-shadow:
		0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent),
		var(--paper-lift);
}
@media (prefers-reduced-motion: reduce) {
	.issue:hover {
		translate: none;
	}
}
/* The issue's own colours, as its cover on the shelf. */
.band {
	display: flex;
	flex: none;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	width: 84px;
	background: var(--tone);
	color: var(--deep);
	font-family: var(--font-serif-stack);
	line-height: 1.1;
}
:global([data-theme="dark"]) .band {
	background: color-mix(in srgb, var(--tone) 24%, var(--raised));
	color: var(--tone);
}
.band .d {
	font-size: 22px;
}
.band .y {
	font-size: 13px;
	opacity: 0.8;
}
.past .band {
	filter: saturate(0.4);
}
.body {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
	padding: 14px 18px;
}
.t {
	font-family: var(--font-serif-stack);
	font-size: 19px;
	line-height: 1.3;
}
.s {
	color: var(--ink-2);
	font-size: 14px;
}
.list {
	margin-top: 6px;
	color: var(--muted);
	font-size: 13px;
	line-height: 1.5;
}
.side {
	display: flex;
	flex: none;
	flex-direction: column;
	align-items: flex-end;
	gap: 6px;
	padding: 14px 16px;
}
@container (max-width: 560px) {
	.issue {
		flex-wrap: wrap;
	}
	.band {
		width: 64px;
	}
	.side {
		flex-direction: row;
		width: 100%;
		padding: 0 16px 12px 82px;
		justify-content: flex-start;
	}
	.body {
		padding-bottom: 6px;
	}
}
</style>
