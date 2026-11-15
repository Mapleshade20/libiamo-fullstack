<script lang="ts">
import Search from "@lucide/svelte/icons/search";
import { fmtCost, fmtWhen, langEn, type SessionRow, SIGNALS } from "#lib/admin/records.ts";
import { sessionList } from "#lib/admin/sessions.remote.ts";
import Signals from "#lib/components/admin/Signals.svelte";
import LanguageFlag from "#lib/components/common/LanguageFlag.svelte";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import Select from "#lib/components/common/Select.svelte";
import { tip } from "#lib/components/common/tip.ts";

/*
 * Every session, to look through now and then. Signals come from the record alone (the learner pushing back, the
 * system struggling), so the sessions worth opening rise to the top without a model judging them. Calls are kept 30
 * days, longer for a flagged session; a session's steps stay as long as the piece. Learners who do not help improve
 * Libiamo are not listed.
 */
const all = $derived(await sessionList());
let sort = $state("signals");
let kind = $state("all");
let signal = $state("any");
let q = $state("");
const KINDS = [
	{ value: "all", label: "All kinds" },
	{ value: "own", label: "Free writing" },
	{ value: "scenario", label: "Scenarios" },
	{ value: "translation", label: "Translations" },
];
const SIG = [
	{ value: "any", label: "Any session" },
	{ value: "learner", label: "Learner pushed back" },
	{ value: "system", label: "System struggled" },
	...Object.entries(SIGNALS).map(([k, v]) => ({ value: k, label: v.name })),
];
const KIND_LABEL = { own: "Free writing", scenario: "Scenario", translation: "Translation" };
const weight = (s: SessionRow) => s.signals.length + s.cases;
const list = $derived(
	all
		.filter((s) => kind === "all" || s.kind === kind)
		.filter(
			(s) =>
				signal === "any" ||
				s.signals.some((g) => (signal === "learner" ? !SIGNALS[g.kind].system : signal === "system" ? SIGNALS[g.kind].system : g.kind === signal)),
		)
		.filter((s) => !q.trim() || `${s.title} ${s.learner} ${s.id}`.toLowerCase().includes(q.trim().toLowerCase()))
		.toSorted((a, b) => (sort === "signals" ? weight(b) - weight(a) || b.at.localeCompare(a.at) : b.at.localeCompare(a.at))),
);
</script>

<div class="adm-page">
	<header class="adm-head"><h1>Sessions</h1></header>
	<div class="adm-filters">
		<SegmentedControl
			label="Order"
			size="sm"
			bind:value={sort}
			items={[
				{ value: "signals", label: "Signals first" },
				{ value: "new", label: "Newest" },
			]}
		/>
		<div class="w-40"><Select aria-label="Kind" size="sm" bind:value={kind} items={KINDS} /></div>
		<div class="w-52"><Select aria-label="Signal" size="sm" bind:value={signal} items={SIG} /></div>
		<span class="grow"></span>
		<label class="adm-search"
			><Search class="size-4" aria-hidden="true" />
			<input class="adm-input" type="search" placeholder="Search" aria-label="Search sessions" bind:value={q}></label
		>
	</div>
	<div class="adm-paper">
		{#if list.length}
			<ul class="adm-rows">
				{#each list as s (s.id)}
					<li>
						<a class="adm-row" href="/admin/sessions/{s.id}">
							<span class="flag" use:tip={`${langEn(s.lang)}, from ${langEn(s.native)}`}><LanguageFlag language={s.lang} size={22} /></span>
							<div class="main">
								<div class="t">{s.title}</div>
								<div class="s">
									<span>{s.learner}</span><span class="adm-dot">{KIND_LABEL[s.kind]}</span><span class="adm-dot">{s.site}</span>
									{#if !s.finished}
										<span class="adm-dot">Unfinished</span>
									{/if}
									{#if s.cases}
										<span class="adm-dot">{s.cases} open {s.cases > 1 ? "cases" : "case"}</span>
									{/if}
								</div>
							</div>
							<div class="sig"><Signals signals={s.signals} /></div>
							<div class="nums">
								<span class="adm-meta">{fmtWhen(s.at)}</span>
								<span class="adm-meta">{s.minutes} min · {s.stops} {s.stops === 1 ? "stop" : "stops"} · {s.calls} calls · {fmtCost(s.cost)}</span>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="adm-empty">No session matches.</p>
		{/if}
	</div>
</div>

<style>
.flag {
	display: grid;
	flex: none;
	place-items: center;
	width: 32px;
}
.sig {
	display: flex;
	flex: 0 0 9.5rem;
	justify-content: flex-end;
}
.nums {
	display: flex;
	flex: 0 0 11.5rem;
	flex-direction: column;
	align-items: flex-end;
	gap: 2px;
}
@container (max-width: 720px) {
	.adm-row {
		flex-wrap: wrap;
	}
	.main {
		flex: 1 1 calc(100% - 60px);
	}
	.sig {
		flex: 1 1 auto;
		justify-content: flex-start;
		padding-left: 46px;
	}
	.nums {
		flex: 0 0 auto;
	}
	.nums .adm-meta:last-child {
		display: none;
	}
}
</style>
