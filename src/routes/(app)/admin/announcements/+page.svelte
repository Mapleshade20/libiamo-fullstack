<script lang="ts">
import Megaphone from "@lucide/svelte/icons/megaphone";
import Plus from "@lucide/svelte/icons/plus";
import { slide } from "svelte/transition";
import { autogrow } from "$lib/components/common/motion";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import Select from "$lib/components/common/Select.svelte";
import Button from "$lib/components/ui/button/button.svelte";
import { type AdminAnnouncement as Ann, adminAnnouncements, fmtDay, langEn } from "$lib/demo/admin";
import { toast } from "$lib/demo/app.svelte";

/*
 * Announcements: written per interface language (a learner sees theirs, else English), shown on the home page as a
 * card that opens in place, until the date set here. The editor keeps the card beside it as learners will read it.
 */
let list = $state<Ann[]>(adminAnnouncements());
let editing = $state<Ann | null>(null);
let lang = $state("en");
const LANGS = ["en", "zh-CN", "es", "fr", "ja", "de"];
const langsOf = (a: Ann) => Object.keys(a.title);
function start(a?: Ann) {
	editing = a ?? { id: Date.now(), date: null, until: "", title: { en: "" }, body: { en: "" }, read: 0 };
	lang = "en";
}
function addLang(l: string) {
	if (!editing) return;
	editing.title[l] = "";
	editing.body[l] = "";
	lang = l;
}
function publish() {
	if (!editing) return;
	const e = editing;
	if (!list.some((a) => a.id === e.id)) list.unshift(e);
	e.date = e.date ?? new Date();
	editing = null;
	toast("Published (demo)");
}
const live = (a: Ann) => !!a.date && (!a.until || new Date(a.until) >= new Date("2026-11-11"));
</script>

<div class="adm-page">
	<header class="adm-head">
		<h1>Announcements</h1>
		{#if !editing}
			<div class="acts">
				<Button onclick={() => start()}><Plus aria-hidden="true" />New announcement</Button>
			</div>
		{/if}
	</header>

	{#if editing}
		{@const e = editing}
		<div class="adm-paper editor" transition:slide={{ duration: 250 }}>
			<div class="bar">
				<SegmentedControl label="Interface language" size="sm" bind:value={lang} items={langsOf(e).map((l) => ({ value: l, label: langEn(l) }))} />
				{#if LANGS.some((l) => !e.title[l])}
					<div class="w-40">
						<Select
							aria-label="Add a language"
							size="sm"
							variant="ghost"
							placeholder="Add a language"
							value=""
							onValueChange={addLang}
							items={LANGS.filter((l) => !e.title[l]).map((l) => ({ value: l, label: langEn(l) }))}
						/>
					</div>
				{/if}
			</div>
			<div class="split">
				<div class="fields">
					<label class="adm-field"><span class="l">Title</span><input class="adm-input" bind:value={e.title[lang]} {lang} data-initial-focus></label>
					<label class="adm-field"
						><span class="l">Text</span
						><textarea class="adm-input" rows="5" use:autogrow={e.body[lang]} bind:value={e.body[lang]} {lang}></textarea></label
					>
					<label class="adm-field until"><span class="l">Shown until</span><input class="adm-input" type="date" bind:value={e.until}></label>
				</div>
				<section class="preview" aria-label="As learners see it">
					<article class="island">
						<div class="head">
							<span class="ic"><Megaphone class="size-5" aria-hidden="true" /></span>
							<span class="copy"
								><span class="meta">{fmtDay((e.date ?? new Date()).toISOString())}</span
								><span class="t" {lang}>{e.title[lang] || "Title"}</span></span
							>
						</div>
						<div class="body" {lang}>
							{#each (e.body[lang] || "Text").split("\n\n") as p}
								<p>{p}</p>
							{/each}
						</div>
					</article>
				</section>
			</div>
			<div class="acts">
				<Button variant="secondary" onclick={() => (editing = null)}>Cancel</Button>
				<Button disabled={!e.title.en?.trim() || !e.body.en?.trim()} onclick={publish}>{e.date ? "Save" : "Publish"}</Button>
			</div>
		</div>
	{/if}

	<div class="adm-paper list">
		<ul class="adm-rows">
			{#each list as a (a.id)}
				<li>
					<button type="button" class="adm-row" onclick={() => start(a)} aria-label="Edit {a.title.en}">
						<span class="main">
							<span class="t">{a.title.en}</span>
							<span class="s">{langsOf(a).map(langEn).join(", ")}</span>
						</span>
						{#if !a.date}
							<span class="adm-tag">Draft</span>
						{:else if live(a)}
							<span class="adm-tag ok">Showing</span>
						{:else}
							<span class="adm-tag">Ended</span>
						{/if}
						<span class="adm-meta num">{a.date ? `${a.read} read` : ""}</span>
						<span class="adm-meta day">{a.until ? `until ${fmtDay(a.until)}` : ""}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
</div>

<style>
.editor {
	margin-bottom: 20px;
}
.bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	padding: 10px 12px;
	border-bottom: 1px solid var(--line-soft);
}
.split {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 20rem;
	gap: 24px;
	padding: 18px 20px;
}
@container (max-width: 760px) {
	.split {
		grid-template-columns: minmax(0, 1fr);
	}
}
.fields {
	display: grid;
	gap: 14px;
	align-content: start;
}
.until {
	max-width: 12rem;
}
/* The announcement as it opens on the home page. */
.preview {
	padding: 16px;
	border-radius: 6px;
	background: var(--well);
}
.island {
	border: 1px solid var(--edge);
	border-radius: 6px;
	background: var(--raised);
	box-shadow: var(--paper-lift);
}
.head {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px;
}
.ic {
	display: grid;
	flex: none;
	place-items: center;
	width: 30px;
	height: 30px;
	color: var(--muted);
}
.copy {
	display: flex;
	flex-direction: column;
	min-width: 0;
}
.meta {
	color: var(--muted);
	font-size: 12px;
}
.t {
	font-size: 15px;
	font-weight: 500;
	line-height: 1.35;
	overflow-wrap: anywhere;
}
.body {
	padding: 0 16px 14px 52px;
	color: var(--ink-2);
	font-size: 14px;
	line-height: 1.6;
}
.body p {
	margin: 0;
}
.body p + p {
	margin-top: 8px;
}
.editor .acts {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
	padding: 0 20px 18px;
}
button.adm-row {
	width: 100%;
	border: 0;
	background: none;
	font: inherit;
	text-align: left;
	cursor: pointer;
}
button.adm-row:hover {
	background: var(--hover);
}
button.adm-row:focus-visible {
	outline: none;
	box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--ring-c) 80%, transparent);
}
.adm-row .main {
	display: flex;
	flex-direction: column;
}
.num {
	width: 5rem;
	text-align: right;
}
.day {
	width: 6.5rem;
	text-align: right;
}
@container (max-width: 560px) {
	.num {
		display: none;
	}
}
</style>
