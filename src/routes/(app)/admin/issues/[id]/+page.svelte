<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Check from "@lucide/svelte/icons/check";
import Trash2 from "@lucide/svelte/icons/trash-2";
import { deleteOneIssue, issueList, saveOneIssue } from "#lib/admin/issues.remote.ts";
import { scenarioList } from "#lib/admin/scenarios.remote.ts";
import Checkbox from "#lib/components/common/Checkbox.svelte";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import { tip } from "#lib/components/common/tip.ts";
import SiteArt from "#lib/components/home/SiteArt.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { toast } from "#lib/demo/app.svelte.ts";
import { siteOf } from "#lib/demo/data.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * One issue: its name and line as the shelf shows them, the day it comes out, its colours, and the four to six
 * scenarios in it (published ones, newest first). Scenarios already in another issue can be picked again; the pool does
 * not care. The id is made from the title when it is first saved.
 */
const TONES = [
	{ tone: "#e8c9a6", deep: "#4a3424" },
	{ tone: "#cfdcc4", deep: "#33442c" },
	{ tone: "#cdd8e3", deep: "#2d3c4c" },
	{ tone: "#e6cdd3", deep: "#4f2c36" },
	{ tone: "#ddd5ea", deep: "#3b3150" },
	{ tone: "#e9dfb8", deep: "#4a4123" },
];
const isNew = $derived(page.params.id === "new");
const issues = $derived(await issueList());
const found = $derived(issues.find((i) => i.id === page.params.id));
const inMonth = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
let it = $state({ title: "", line: "", date: "", tone: TONES[0].tone, deep: TONES[0].deep, scenarios: [] as string[] });
let shown = "";
$effect.pre(() => {
	const key = found?.id ?? (isNew ? "new" : "");
	if (key === shown) return;
	shown = key;
	it = found
		? {
				title: found.title.en ?? "",
				line: found.line.en ?? "",
				date: found.date,
				tone: found.tone,
				deep: found.deep,
				scenarios: found.scenarios.map((s) => s.id),
			}
		: { title: "", line: "", date: inMonth(), tone: TONES[2].tone, deep: TONES[2].deep, scenarios: [] };
});
let saving = $state(false);
let deleting = $state(false);
const slug = (t: string) =>
	t
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
async function save() {
	if (saving) return;
	saving = true;
	let id = found?.id ?? slug(it.title);
	if (isNew && issues.some((i) => i.id === id)) id = `${id}-${it.date.slice(0, 7)}`;
	const r = await saveOneIssue({ isNew, issue: { id, ...$state.snapshot(it) } }).catch(() => ({ ok: false as const, error: "Could not save it." }));
	saving = false;
	if (!r.ok) return toast(r.error);
	toast(new Date(`${it.date}T12:00`) > new Date() ? `Scheduled for ${it.date}` : "Saved");
	if (isNew) goto(`/admin/issues/${id}`, { replaceState: true });
}
async function remove() {
	deleting = false;
	if (!found) return;
	await deleteOneIssue(found.id).catch(() => toast("Could not delete it"));
	goto("/admin/issues", { replaceState: true });
}
const n = $derived(it.scenarios.length);
const ok = $derived(n >= 4 && n <= 6 && !!it.title.trim());
function toggle(id: string) {
	const i = it.scenarios.indexOf(id);
	if (i >= 0) it.scenarios.splice(i, 1);
	else if (n < 6) it.scenarios.push(id);
}
// What can go in: published scenarios, and whatever this issue already holds.
const pool = $derived((await scenarioList()).filter((s) => s.status === "published" || it.scenarios.includes(s.id)));
</script>

<div class="adm-page">
	<a class="adm-back" href="/admin/issues"><ArrowLeft class="size-4" aria-hidden="true" />Issues</a>
	<header class="adm-head">
		<h1>{isNew ? "New issue" : it.title || "Untitled"}</h1>
		<div class="acts">
			{#if found}
				<button type="button" class="adm-icon" aria-label="Delete this issue" use:tip={"Delete"} onclick={() => (deleting = true)}>
					<Trash2 class="size-4" aria-hidden="true" />
				</button>
			{/if}
			{#if isNew || found?.state === "scheduled"}
				<Button disabled={!ok || saving} onclick={save}>Schedule</Button>
			{:else}
				<Button disabled={!ok || saving} onclick={save}>Save</Button>
			{/if}
		</div>
	</header>

	<div class="adm-paper pad">
		<div class="top">
			<div class="cover" style:--tone={it.tone} style:--deep={it.deep} aria-hidden="true">
				<span class="ct">{it.title || "Title"}</span>
				<span class="cl">{it.line || "A line about it"}</span>
			</div>
			<div class="adm-grid fields">
				<label class="adm-field full"><span class="l">Title</span><input class="adm-input" bind:value={it.title} placeholder="Winter letters"></label>
				<label class="adm-field full"
					><span class="l">Line</span><input class="adm-input" bind:value={it.line} placeholder="Cards, thank-yous and a cancelled trip."></label
				>
				<label class="adm-field"><span class="l">Comes out</span><input class="adm-input" type="date" bind:value={it.date}></label>
				<div class="adm-field">
					<span class="l" id="tone-l">Colours</span>
					<div class="tones" role="radiogroup" aria-labelledby="tone-l">
						{#each TONES as t (t.tone)}
							<!-- biome-ignore lint/a11y/useSemanticElements: colour swatches; a native radio cannot be drawn as one -->
							<button
								type="button"
								role="radio"
								class="tone"
								aria-checked={it.tone === t.tone}
								aria-label={t.tone}
								style:--tone={t.tone}
								style:--deep={t.deep}
								onclick={() => {
									it.tone = t.tone;
									it.deep = t.deep;
								}}
							>
								{#if it.tone === t.tone}
									<Check class="size-3.5" aria-hidden="true" />
								{/if}
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>

	<section class="adm-section" aria-labelledby="h-in">
		<h2 id="h-in">Scenarios <span class="n" class:short={n < 4}>{n} of 4–6</span></h2>
		<div class="adm-paper">
			<ul class="adm-rows">
				{#each pool as s (s.id)}
					{@const st = siteOf(s.site)}
					{@const on = it.scenarios.includes(s.id)}
					<li>
						<!-- biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders a native checkbox inside the label -->
						<label class="adm-row pick" class:off={!on && n >= 6}>
							<Checkbox checked={on} disabled={!on && n >= 6} onchange={() => toggle(s.id)} />
							<span class="art" style:--tone={st.tone} style:--deep={st.deep}><SiteArt art={st.art} size={24} /></span>
							<span class="main"><span class="t">{s.title}</span><span class="s">{s.line}</span></span>
							<span class="adm-meta">{s.site}</span>
						</label>
					</li>
				{/each}
			</ul>
		</div>
	</section>
</div>

<ModalDialog bind:open={deleting} labelledby="del-h">
	<h2 id="del-h" class="mb-2">Delete this issue?</h2>
	<p class="imp-p">Its scenarios stay in the pool.</p>
	<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (deleting = false)} data-initial-focus>Cancel</Button>
		<Button variant="destructive-solid" onclick={remove}>Delete</Button>
	</div>
</ModalDialog>

<style>
.pad {
	padding: 18px 20px 20px;
}
.top {
	display: flex;
	gap: 22px;
	align-items: flex-start;
}
.cover {
	display: flex;
	flex: none;
	flex-direction: column;
	justify-content: flex-end;
	gap: 4px;
	width: 150px;
	aspect-ratio: 3 / 4;
	padding: 14px;
	border-radius: 5px;
	background: var(--tone);
	color: var(--deep);
	box-shadow: var(--paper-lift);
	rotate: -1.2deg;
	transition: background-color 250ms var(--ease-panel);
}
:global([data-theme="dark"]) .cover {
	background: color-mix(in srgb, var(--tone) 24%, var(--raised));
	color: var(--tone);
}
.ct {
	font-family: var(--font-serif-stack);
	font-size: 18px;
	line-height: 1.2;
	overflow-wrap: anywhere;
}
.cl {
	font-size: 12px;
	line-height: 1.4;
	opacity: 0.85;
}
.fields {
	flex: 1;
	min-width: 0;
}
@container (max-width: 640px) {
	.top {
		flex-direction: column;
	}
	.cover {
		width: 120px;
	}
}
.tones {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
	min-height: 40px;
}
.tone {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 50%;
	border: 1px solid color-mix(in srgb, var(--deep) 25%, transparent);
	background: var(--tone);
	color: var(--deep);
	cursor: pointer;
	transition: scale 150ms;
}
.tone:active {
	scale: 0.92;
}
.tone[aria-checked="true"] {
	box-shadow:
		0 0 0 2px var(--raised),
		0 0 0 3.5px var(--ink);
}
.tone:focus-visible {
	outline: none;
	box-shadow:
		0 0 0 2px var(--raised),
		0 0 0 4px color-mix(in oklab, var(--ring-c) 80%, transparent);
}
@media (pointer: coarse) {
	.tone {
		width: 36px;
		height: 36px;
	}
}
.n.short {
	color: var(--warn);
}
.pick {
	cursor: pointer;
	min-height: 56px;
	padding-block: 8px;
}
.pick:hover {
	background: var(--hover);
}
.pick.off {
	cursor: default;
	opacity: 0.55;
}
.pick.off:hover {
	background: none;
}
.pick .main {
	display: flex;
	flex-direction: column;
}
.pick .t {
	font-size: 14.5px;
}
.pick .s {
	font-size: 12.5px;
}
.art {
	display: grid;
	flex: none;
	place-items: center;
	width: 34px;
	height: 34px;
	border-radius: 5px;
	background: var(--tone);
	color: var(--deep);
}
:global([data-theme="dark"]) .art {
	background: color-mix(in srgb, var(--tone) 22%, var(--raised));
	color: var(--tone);
}
</style>
