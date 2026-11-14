<script lang="ts">
import Plus from "@lucide/svelte/icons/plus";
import Search from "@lucide/svelte/icons/search";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import Select from "#lib/components/common/Select.svelte";
import { tip } from "#lib/components/common/tip.ts";
import SiteArt from "#lib/components/home/SiteArt.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { adminScenarios, fmtDay, languagesOf, SOURCES, scenarioStatus, written } from "#lib/demo/admin.ts";
import { siteOf } from "#lib/demo/data.ts";

/*
 * Every scenario, newest first. A place scenario is written once per learning language; a translation once, with a
 * source per learner language that the admin confirms (a source with checker notes is what waits here).
 */
let kind = $state("all");
let lang = $state("all");
let q = $state("");
const LANGS = [
	{ value: "all", label: "All languages" },
	{ value: "en", label: "English" },
	{ value: "es", label: "Español" },
	{ value: "fr", label: "Français" },
	{ value: "ja", label: "日本語" },
];
const list = $derived(
	adminScenarios()
		.filter((s) => kind === "all" || (kind === "translate") === (s.site === "Translate"))
		.filter((s) => lang === "all" || languagesOf(s).includes(lang))
		.filter((s) => !q.trim() || `${s.title.en} ${s.line.en} ${s.site}`.toLowerCase().includes(q.trim().toLowerCase()))
		.toSorted((a, b) => b.added.localeCompare(a.added)),
);
const notes = (id: string) => (SOURCES[id] ?? []).filter((s) => s.state === "notes").length;
</script>

<div class="adm-page">
	<header class="adm-head">
		<h1>Scenarios</h1>
		<div class="acts">
			<Button href="/admin/scenarios/new"><Plus aria-hidden="true" />New scenario</Button>
		</div>
	</header>
	<div class="adm-filters">
		<SegmentedControl
			label="Kind"
			size="sm"
			bind:value={kind}
			items={[
				{ value: "all", label: "All" },
				{ value: "place", label: "Places" },
				{ value: "translate", label: "Translations" },
			]}
		/>
		<div class="w-44"><Select aria-label="Language" size="sm" bind:value={lang} items={LANGS} /></div>
		<span class="grow"></span>
		<label class="adm-search"
			><Search class="size-4" aria-hidden="true" />
			<input class="adm-input" type="search" placeholder="Search" aria-label="Search scenarios" bind:value={q}></label
		>
	</div>
	<div class="adm-paper">
		{#if list.length}
			<ul class="adm-rows">
				{#each list as s (s.id)}
					{@const st = siteOf(s.site)}
					{@const status = scenarioStatus(s.id)}
					<li>
						<a class="adm-row" href="/admin/scenarios/{s.id}">
							<span class="art" style:--tone={st.tone} style:--deep={st.deep}><SiteArt art={st.art} size={30} /></span>
							<div class="main">
								<div class="t">{s.title.en}</div>
								<div class="s">{s.line.en}</div>
							</div>
							<div class="side">
								{#if status === "draft"}
									<span class="adm-tag">Draft</span>
								{:else if status === "notes"}
									<span class="adm-tag warn">{notes(s.id)} source to check</span>
								{/if}
								<span class="adm-meta langs" use:tip={"Learning languages"}>{languagesOf(s).join(" ")}</span>
								<span class="adm-meta num" use:tip={"Pieces written"}>{status === "draft" ? "–" : written(s.id)}</span>
								<span class="adm-meta day" use:tip={"Added"}>{fmtDay(s.added)}</span>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="adm-empty">No scenario matches.</p>
		{/if}
	</div>
</div>

<style>
.art {
	display: grid;
	flex: none;
	place-items: center;
	width: 44px;
	height: 44px;
	border-radius: 6px;
	background: var(--tone);
	color: var(--deep);
}
:global([data-theme="dark"]) .art {
	background: color-mix(in srgb, var(--tone) 22%, var(--raised));
	color: var(--tone);
}
.side {
	display: flex;
	flex: none;
	align-items: center;
	gap: 14px;
}
.langs {
	width: 5.5rem;
	text-align: right;
	text-transform: none;
}
.num {
	width: 2rem;
	text-align: right;
}
.day {
	width: 3.6rem;
	text-align: right;
}
@container (max-width: 640px) {
	.adm-row {
		align-items: flex-start;
	}
	.side {
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}
	.num,
	.langs {
		display: none;
	}
}
</style>
