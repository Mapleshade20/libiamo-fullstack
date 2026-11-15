<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import ExternalLink from "@lucide/svelte/icons/external-link";
import Search from "@lucide/svelte/icons/search";
import { langEn as nameOf } from "#lib/admin/records.ts";
import { tip } from "#lib/components/common/tip.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { nameTables, saveNames } from "#lib/translation/names.remote.ts";
import type { NameRow, NameTable } from "#lib/translation/names.ts";

/*
 * The admin's name tables (server/translation/tables.ts): for each work and learner language, how every name and term
 * is written in the sources. Each row shows what the sources found or the model proposed, and why; the admin keeps it,
 * types another rendering, or keeps the original spelling, then confirms. Only confirmed rows reach a source. Wikis a
 * program cannot read are search links. Shown on the admin page (/admin/names).
 */
const loadedTables = await nameTables();
// The page edits its own copy; each change is sent back whole.
let tables = $state<NameTable[]>(structuredClone(loadedTables.tables));
const works = $derived(loadedTables.works);
let saved = $state<string | null>(null);
const loaded = true;
let timer: ReturnType<typeof setTimeout> | undefined;
function save(t: NameTable) {
	clearTimeout(timer);
	timer = setTimeout(async () => {
		await saveNames($state.snapshot(t));
		saved = `${t.work}.${t.locale}`;
		setTimeout(() => (saved = null), 1600);
	}, 300);
}
function edit(t: NameTable, r: NameRow, patch: Partial<NameRow>) {
	Object.assign(r, patch);
	save(t);
}
const ORIGIN: Record<NameRow["origin"], string> = {
	wiki: "the work's wiki",
	wikipedia: "Wikipedia",
	wikidata: "Wikidata",
	model: "proposed by the model",
	admin: "set by you",
	none: "nothing found",
};
const left = (t: NameTable) => t.rows.filter((r) => r.status !== "confirmed").length;
</script>

{#if loaded && !tables.length}
	<p class="empty">No name tables yet.</p>
{/if}
{#each tables as t (`${t.work}.${t.locale}`)}
	{@const w = works[t.work]}
	<section class="work" aria-labelledby="h-{t.work}-{t.locale}">
		<header>
			<h2 id="h-{t.work}-{t.locale}">{w?.title ?? t.work} · {nameOf(t.locale)}</h2>
			<span class="count" class:done={!left(t)}>{left(t) ? `${left(t)} to confirm` : "All confirmed"}</span>
			{#if saved === `${t.work}.${t.locale}`}
				<span class="saved" role="status">Saved</span>
			{/if}
		</header>
		<ul class="rows">
			{#each t.rows as r (r.term)}
				<li class="row" class:confirmed={r.status === "confirmed"}>
					<div class="term">
						<b>{r.term}</b><span class="kind">{r.kind}</span>
					</div>
					<div class="decide">
						<input
							class="field"
							lang={t.locale}
							value={r.rendering ?? ""}
							placeholder="{r.term} (as in the original)"
							aria-label="How {r.term} is written"
							disabled={r.status === "confirmed"}
							oninput={(e) => edit(t, r, { rendering: e.currentTarget.value.trim() || null, origin: "admin" })}
						>
						<p class="origin">
							<span class="src">{ORIGIN[r.origin]}</span>
							{#if r.url}
								<a href={r.url} target="_blank" rel="noopener" use:tip={r.url}
									><ExternalLink class="size-3.5" aria-hidden="true" /><span class="sr-only">{r.url}</span></a
								>
							{/if}
						</p>
						{#if r.why}
							<p class="why">{r.why}</p>
						{/if}
						{#if (r.candidates?.length ?? 0) > 0 || w?.manual?.some((m) => m.lang === t.locale)}
							<div class="also">
								{#each r.candidates ?? [] as c}
									<button
										type="button"
										class="cand"
										class:on={c.rendering === r.rendering}
										disabled={r.status === "confirmed"}
										onclick={() => edit(t, r, { rendering: c.rendering, origin: c.source, url: c.url })}
										use:tip={c.about}
									>
										{c.rendering}
									</button>
								{/each}
								{#each w?.manual?.filter((m) => m.lang === t.locale) ?? [] as m}
									<a class="cand link" href={m.search.replace("{q}", encodeURIComponent(r.term))} target="_blank" rel="noopener"
										><Search class="size-3.5" aria-hidden="true" />{m.name}</a
									>
								{/each}
							</div>
						{/if}
					</div>
					<div class="act">
						{#if r.status === "confirmed"}
							<Button variant="ghost" size="sm" onclick={() => edit(t, r, { status: "pending" })}><Check aria-hidden="true" />Confirmed</Button>
						{:else}
							<Button variant="secondary" size="sm" onclick={() => edit(t, r, { status: "confirmed" })}>Confirm</Button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/each}

<style>
.empty {
	color: var(--muted);
}
.work {
	margin-bottom: 32px;
}
header {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 4px 12px;
	margin-bottom: 10px;
}
h2 {
	font-size: 22px;
	margin: 0;
}
.count {
	font-size: 13px;
	color: var(--warn);
}
.count.done {
	color: var(--ok);
}
.saved {
	font-size: 13px;
	color: var(--muted);
}
.rows {
	list-style: none;
	margin: 0;
	padding: 0;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--raised);
	box-shadow: var(--paper-lift);
}
.row {
	display: grid;
	grid-template-columns: minmax(130px, 200px) minmax(0, 1fr) auto;
	gap: 16px;
	align-items: start;
	padding: 14px 18px;
}
.row + .row {
	border-top: 1px solid var(--line-soft);
}
@media (max-width: 700px) {
	.row {
		grid-template-columns: 1fr;
		gap: 8px;
	}
}
.term {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-top: 8px;
}
.term b {
	font-weight: 600;
}
.kind {
	font-size: 12.5px;
	color: var(--muted);
}
.field {
	width: 100%;
	height: 40px;
	padding: 0 12px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--field);
	color: var(--ink);
	font-size: 15px;
	transition: border-color 150ms;
}
.field:focus-visible {
	outline: 0;
	border-color: color-mix(in srgb, var(--ink) 35%, transparent);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring-c) 50%, transparent);
}
.field:disabled {
	background: transparent;
	border-color: transparent;
	padding-inline: 0;
	font-weight: 500;
}
.field::placeholder {
	color: var(--muted);
}
.origin {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 8px;
	margin: 6px 0 0;
	font-size: 13px;
	color: var(--muted);
}
.origin a {
	color: var(--muted);
	display: inline-flex;
}
.origin a:hover {
	color: var(--ink);
}
.src {
	color: var(--ink-2);
}
.why {
	margin: 2px 0 0;
	font-size: 13px;
	color: var(--muted);
}
.also {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
}
.cand {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 2px 9px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--card-bg);
	font-size: 13px;
	color: var(--ink);
	text-decoration: none;
	transition:
		background-color 150ms,
		transform 100ms;
}
.cand:hover:not(:disabled) {
	background: var(--card-hover);
}
.cand:active:not(:disabled) {
	transform: scale(0.97);
}
.cand:disabled {
	opacity: 0.5;
}
.cand.link {
	color: var(--ink-2);
}
.act {
	padding-top: 4px;
}
/* Confirmed: the row's margin turns the status colour, and so does its button. */
.row.confirmed {
	box-shadow: inset 3px 0 0 var(--ok);
}
.row.confirmed .act :global(button) {
	color: var(--ok);
}
.cand.on {
	background: var(--ink);
	border-color: var(--ink);
	color: var(--bg);
}
</style>
