<script lang="ts">
import Plus from "@lucide/svelte/icons/plus";
import Search from "@lucide/svelte/icons/search";
import { scenarioList } from "#lib/admin/scenarios.remote.ts";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import Select from "#lib/components/common/Select.svelte";
import { tip } from "#lib/components/common/tip.ts";
import SiteArt from "#lib/components/home/SiteArt.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { LEARNABLE, langName } from "#lib/constants.ts";
import { fmtDay } from "#lib/demo/admin.ts";
import { siteOf } from "#lib/demo/data.ts";

/*
 * Every scenario, newest first. A place scenario is written once per learning language; a translation once, with a
 * source per learner language that the admin confirms (a source with checker notes is what waits here).
 */
let kind = $state("all");
let lang = $state("all");
let q = $state("");
const all = $derived(await scenarioList());
const LANGS = $derived([
	{ value: "all", label: "All languages" },
	...LEARNABLE.filter((l) => all.some((s) => s.languages.includes(l))).map((l) => ({ value: l, label: langName(l, l) })),
]);
const list = $derived(
	all
		.filter((s) => kind === "all" || (kind === "translate") === (s.kind === "translation"))
		.filter((s) => lang === "all" || s.languages.includes(lang))
		.filter((s) => !q.trim() || `${s.id} ${s.title} ${s.line} ${s.site}`.toLowerCase().includes(q.trim().toLowerCase()))
		.toSorted((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt)),
);
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
					<li>
						<a class="adm-row" href="/admin/scenarios/{s.id}">
							<span class="art" style:--tone={st.tone} style:--deep={st.deep}><SiteArt art={st.art} size={30} /></span>
							<div class="main">
								<div class="t">{s.title}</div>
								<div class="s">{s.line}</div>
							</div>
							<div class="side">
								{#if s.status === "draft"}
									<span class="adm-tag">Draft</span>
								{:else if s.status === "withdrawn"}
									<span class="adm-tag">Withdrawn</span>
								{/if}
								{#if s.toCheck}
									<span class="adm-tag warn">{s.toCheck} {s.toCheck > 1 ? "sources" : "source"} to check</span>
								{/if}
								<span class="adm-meta langs" use:tip={"Learning languages"}>{s.languages.join(" ")}</span>
								<span class="adm-meta num" use:tip={"Pieces written"}>{s.status === "draft" ? "–" : s.written}</span>
								<span class="adm-meta day" use:tip={s.publishedAt ? "Published" : "Last saved"}>{fmtDay(s.publishedAt ?? s.updatedAt)}</span>
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
