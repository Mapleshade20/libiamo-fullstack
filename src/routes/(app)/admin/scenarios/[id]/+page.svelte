<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ClipboardPaste from "@lucide/svelte/icons/clipboard-paste";
import Download from "@lucide/svelte/icons/download";
import Ellipsis from "@lucide/svelte/icons/ellipsis";
import ExternalLink from "@lucide/svelte/icons/external-link";
import FileUp from "@lucide/svelte/icons/file-up";
import Lock from "@lucide/svelte/icons/lock";
import Pencil from "@lucide/svelte/icons/pencil";
import Plus from "@lucide/svelte/icons/plus";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Trash2 from "@lucide/svelte/icons/trash-2";
import Undo2 from "@lucide/svelte/icons/undo-2";
import X from "@lucide/svelte/icons/x";
import { type CaptureCut, mergePeople, parseCapture } from "#lib/admin/capture.ts";
import { type FlatComment, flattenComments, isThreaded, nestComments } from "#lib/admin/opening-form.ts";
import { fmtDay, langEn } from "#lib/admin/records.ts";
import { confirm, deleteOne, remake, saveOne, scenarioOne, withdrawOne } from "#lib/admin/scenarios.remote.ts";
import CaptureImport from "#lib/components/admin/CaptureImport.svelte";
import OpeningEditor from "#lib/components/admin/OpeningEditor.svelte";
import Suggestion from "#lib/components/admin/Suggestion.svelte";
import Accordion from "#lib/components/common/Accordion.svelte";
import Checkbox from "#lib/components/common/Checkbox.svelte";
import FloatingPanel from "#lib/components/common/FloatingPanel.svelte";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import { autogrow } from "#lib/components/common/motion.ts";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import Select from "#lib/components/common/Select.svelte";
import { tip } from "#lib/components/common/tip.ts";
import ScenarioCard from "#lib/components/home/ScenarioCard.svelte";
import Situation from "#lib/components/scenario/Situation.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { type ExchangePlace, LEARNABLE, type Place, type ScenarioStatus, type SourceState, type Urgency } from "#lib/constants.ts";
import { openingNames, situationOf } from "#lib/exchange/opening.ts";
import { blankOpening, blankVersion } from "#lib/scenario/blank.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import type { ExchangeVersion, TranslationVersion, Version } from "#lib/scenario/versions.ts";
import type { AdminSource, SourceEdit } from "#lib/server/admin/scenarios.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * One scenario. A place scenario: where it happens and how the simulation paces it; each learning language's version
 * (title, the card's line, the introduction learners and every model read, and the opening in the place's own terms);
 * then the conversation: who the learner is, what they want, each person there with their notes, who else may turn up,
 * and how the real conversation went on (learners never see it). A translation: the original, the terms its source
 * must give, whose name table it follows, and a source per learner language, made when it is published, checked,
 * then confirmed or made again. Once learners have written in it, where it happens is fixed. Export and import carry a
 * scenario between developers' machines as JSON (the content document's shape).
 */
type Draft = {
	id: string;
	kind: "exchange" | "translation";
	place: Place;
	status: ScenarioStatus;
	minutes: number;
	urgency: Urgency | null;
	maxTurns: number | null;
	workId: string | null;
	versions: Record<string, Version>;
};
const URGENCY: { value: Urgency; label: string }[] = [
	{ value: "high", label: "Soon · about 30 s" },
	{ value: "medium", label: "In a while · about 2 min" },
	{ value: "low", label: "Later · about 10 min" },
];
const isNew = $derived(page.params.id === "new");
const loaded = $derived(isNew ? null : await scenarioOne(page.params.id ?? ""));
const blank = (): Draft => ({
	id: "",
	kind: "exchange",
	place: "reddit",
	status: "draft",
	minutes: 10,
	urgency: "medium",
	maxTurns: null,
	workId: null,
	versions: { en: blankVersion("exchange", "reddit", "") },
});
let d = $state<Draft>(blank());
/** A thread's comments per language, flat while edited (lib/admin/opening-form.ts). */
let threads = $state<Record<string, FlatComment[]>>({});
let lang = $state("en");
let view = $state("edit");
let idTouched = $state(false);
let saving = $state(false);
let problem = $state("");

function take(src: Draft) {
	const copy = structuredClone(src);
	threads = {};
	if (isThreaded(copy.place))
		for (const [l, v] of Object.entries(copy.versions)) {
			const op = (v as ExchangeVersion).opening as Record<string, unknown>;
			threads[l] = flattenComments(copy.place, op.previousComments);
			delete op.previousComments;
		}
	if (copy.kind === "translation") for (const x of Object.values(copy.versions)) (x as TranslationVersion).leaveOut ??= [];
	d = copy;
	lang = Object.keys(copy.versions)[0] ?? "en";
	problem = "";
}
// The page edits its own copy, taken again when another scenario is opened (not when a save refreshes the same one).
let shown = "";
$effect.pre(() => {
	const key = isNew ? "new" : (loaded?.id ?? "");
	if (key === shown) return;
	shown = key;
	if (isNew) take(blank());
	else if (loaded) {
		const { publishedAt: _p, written: _w, sources: _s, works: _k, from: _f, ...draft } = loaded;
		take(draft as Draft);
	}
});

const translate = $derived(d.kind === "translation");
const locked = $derived(!isNew && (loaded?.written ?? 0) > 0);
const v = $derived(d.versions[lang]);
const ev = $derived(translate ? undefined : (v as ExchangeVersion | undefined));
const tv = $derived(translate ? (v as TranslationVersion | undefined) : undefined);
const missing = $derived(LEARNABLE.filter((l) => !d.versions[l]));
const SITES = (["ao3", "reddit", "email", "discord", "imessage", "translation"] as const).map((p) => ({
	value: p,
	label: p === "translation" ? "Translation" : SITE_OF[p],
}));
let importing = $state(false);
let pasted = $state("");
const from = $derived(loaded?.from ?? null);
/** A suggestion's capture of this scenario's place, to cut the opening from. */
const suggested = $derived(from && parseCapture(from.situation)?.platform === d.place ? from.situation : null);
let menu = $state(false);
let jsonOpen = $state(false);
let json = $state("");
/** A step that cannot be undone, waiting on the admin's word (kept while the dialog closes, so its words stay). */
type Ask = { title: string; text: string; act: string; go: () => void };
let asking = $state<Ask>({ title: "", text: "", act: "", go: () => {} });
let askOpen = $state(false);
const ask = (a: Ask) => {
	asking = a;
	askOpen = true;
};

/** The opening as stored: a thread's comments nested again. */
function openingOf(l: string, x: ExchangeVersion) {
	const op = { ...(x.opening as Record<string, unknown>) };
	if (isThreaded(d.place)) op.previousComments = nestComments(d.place, threads[l] ?? []);
	return op;
}
function versionsOut(): Record<string, Version> {
	if (translate) return $state.snapshot(d.versions) as Record<string, Version>;
	return Object.fromEntries(
		Object.entries($state.snapshot(d.versions) as Record<string, ExchangeVersion>).map(([l, x]) => [l, { ...x, opening: openingOf(l, x) }]),
	);
}

function setPlace(p: string) {
	const place = p as Place;
	const toTranslation = place === "translation";
	if (toTranslation !== translate) {
		d.kind = toTranslation ? "translation" : "exchange";
		d.versions = { [lang]: blankVersion(d.kind, place, v?.title ?? "") };
		d.urgency = toTranslation ? null : "medium";
		d.maxTurns = null;
		threads = {};
	} else if (!toTranslation)
		for (const x of Object.values(d.versions) as ExchangeVersion[]) x.opening = blankOpening(place as ExchangePlace, x.people[0]?.name || undefined);
	if (isThreaded(place)) for (const l of Object.keys(d.versions)) threads[l] = [];
	d.place = place;
}
function addLanguage(l: string) {
	d.versions[l] = blankVersion(d.kind, d.place, "");
	if (isThreaded(d.place)) threads[l] = [];
	lang = l;
	view = "edit";
}
function removeLanguage() {
	if (Object.keys(d.versions).length < 2) return;
	delete d.versions[lang];
	delete threads[lang];
	lang = Object.keys(d.versions)[0];
}
/** A new scenario's id follows its first title until the admin writes one. */
const slug = (t: string) =>
	t
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
$effect(() => {
	if (isNew && !idTouched) d.id = slug(Object.values(d.versions)[0]?.title ?? "");
});

async function save(publish: boolean) {
	if (saving) return;
	saving = true;
	problem = "";
	const draft = { ...$state.snapshot(d), versions: versionsOut() };
	const r = await saveOne({ draft, isNew, publish }).catch((e) => ({ ok: false as const, error: (e as Error).message || "Could not save." }));
	saving = false;
	if (!r.ok) {
		problem = r.error;
		return;
	}
	if (publish) d.status = "published";
	toast(publish ? (translate ? "Published: sources are being made for each learner language" : "Published") : "Saved");
	if (isNew) goto(`/admin/scenarios/${draft.id}`, { replace: true });
}
async function withdraw() {
	await withdrawOne(d.id).catch(() => toast("Could not withdraw it"));
	d.status = "withdrawn";
}
async function remove() {
	const ok = await deleteOne(d.id)
		.then(() => true)
		.catch(() => false);
	if (!ok) return toast("Learners have written in it: withdraw it instead");
	goto("/admin/scenarios", { replace: true });
}

/** Everything a scenario is, as one JSON a developer can hand to another (lab/seed/scenarios.json's shape). */
const exported = () => JSON.stringify({ ...$state.snapshot(d), versions: versionsOut() }, null, "\t");
function download() {
	menu = false;
	const a = document.createElement("a");
	a.href = URL.createObjectURL(new Blob([exported()], { type: "application/json" }));
	a.download = `scenario-${d.id || "new"}.json`;
	a.click();
	URL.revokeObjectURL(a.href);
}
let jsonError = $state("");
function importJson() {
	try {
		const raw = JSON.parse(json);
		const x = raw?.scenarios?.[0] ?? raw;
		if (!x?.versions || !x.kind || !x.place) throw new Error("not a scenario");
		if (locked && x.place !== d.place) throw new Error("learners have written in this scenario, so where it happens cannot change");
		take({ ...blank(), ...x, id: isNew ? (x.id ?? "") : d.id, status: d.status });
		if (isNew && x.id) idTouched = true;
		jsonOpen = false;
		json = "";
		toast("Imported: review it, then save");
	} catch (e) {
		jsonError = e instanceof SyntaxError ? "That is not valid JSON." : `It cannot be imported: ${(e as Error).message}.`;
	}
}

/** A capture's cut (CaptureImport, which refused one the version would not save): its opening, what followed, its people. */
function importCapture(cut: CaptureCut) {
	if (!ev) return;
	const opening = structuredClone(cut.opening) as Record<string, unknown>;
	if (isThreaded(d.place)) {
		threads[lang] = flattenComments(d.place, opening.previousComments);
		delete opening.previousComments;
	}
	ev.opening = opening;
	ev.followed = cut.followed;
	ev.people = mergePeople(ev.people, cut.people);
	view = "edit";
	toast("Imported: check the opening and the people, then save");
}

/** Whoever writes in the opening must be one of the People (the server refuses it otherwise). */
const unlisted = $derived(
	ev ? openingNames(d.place as ExchangePlace, openingOf(lang, ev)).filter((n) => !ev.people.some((p) => p.name.trim() === n)) : [],
);
const preview = $derived(ev ? situationOf(d.place as ExchangePlace, openingOf(lang, ev), ev.people[0]?.name) : undefined);

const STATE: Record<SourceState, { label: string; tone: string }> = {
	pending: { label: "Being made", tone: "" },
	checked: { label: "Checked, to confirm", tone: "" },
	notes: { label: "To look at", tone: "warn" },
	confirmed: { label: "Confirmed", tone: "ok" },
	failed: { label: "Failed", tone: "warn" },
};
type Issue = { paragraph: number; kind: string; original: string; source: string; note: string };
const notesOf = (n: unknown) => (n ?? {}) as { issues?: Issue[]; names?: string[]; error?: string; edited?: boolean };
const sources = $derived(loaded?.sources ?? []);
// While sources are being made, the page asks again now and then.
$effect(() => {
	if (!sources.some((s) => s.state === "pending")) return;
	const t = setInterval(() => scenarioOne(d.id).refresh(), 10_000);
	return () => clearInterval(t);
});
const sourceAct = (fn: typeof remake, r: AdminSource) =>
	fn({ scenarioId: d.id, sourceId: r.id, generation: r.generation }).catch(() => toast("Could not do that"));
// A source the admin edited is made again only once they agree to lose the edits: by "Make again", or by a save that
// changes its version (or the work), which queues it again.
function guarded(lost: AdminSource[], go: () => void) {
	if (!lost.length) return go();
	ask({
		title: "Lose the edits?",
		text: `The source for ${lost.map((r) => langEn(r.native)).join(", ")} is made again, and what you wrote in it goes.`,
		act: "Make it again",
		go,
	});
}
const sig = (x: Version | undefined) =>
	JSON.stringify({ ...x, leaveOut: (x as TranslationVersion)?.leaveOut?.length ? (x as TranslationVersion).leaveOut : undefined });
const trySave = (publish: boolean) =>
	guarded(
		translate && loaded && (publish || d.status === "published")
			? sources.filter(
					(r) => notesOf(r.notes).edited && (d.workId !== loaded.workId || sig(d.versions[r.language]) !== sig(loaded.versions[r.language])),
				)
			: [],
		() => save(publish),
	);
let editing = $state<(SourceEdit & { id: string }) | null>(null);
const GLOSS = [
	["term", "Term, as in the original"],
	["shown", "As the source shows it"],
	["gloss", "What it means"],
] as const;
let editProblem = $state("");
const edit = (r: AdminSource) => {
	editing = { id: r.id, title: r.title, text: r.text, glossary: structuredClone(r.glossary) };
	editProblem = "";
};
async function saveEdit(r: AdminSource) {
	if (!editing) return;
	const { id: _, ...e } = $state.snapshot(editing);
	await confirm({ scenarioId: d.id, sourceId: r.id, generation: r.generation, edit: e }).then(
		() => (editing = null),
		(err) => (editProblem = err?.body?.message ?? "Could not save it."),
	);
}
</script>

<div class="adm-page">
	<a class="adm-back" href="/admin/scenarios"><ArrowLeft class="size-4" aria-hidden="true" />Scenarios</a>
	<header class="adm-head">
		<div class="ttl">
			<h1>{isNew ? "New scenario" : Object.values(d.versions)[0]?.title || "Untitled"}</h1>
			<p class="adm-meta">
				{#if d.status === "draft"}
					<span class="adm-tag">Draft</span>
				{:else if d.status === "withdrawn"}
					<span class="adm-tag">Withdrawn</span>
				{:else}
					<span class="adm-tag ok">Published</span>
				{/if}
				{#if loaded}
					<span class="since"
						>{loaded.id}
						{#if loaded.publishedAt}
							{" · "}Published {fmtDay(loaded.publishedAt)}
						{/if}
						{#if loaded.written}
							{" · "}{loaded.written}
							{loaded.written > 1 ? "pieces" : "piece"}
							written
						{/if}</span
					>
				{/if}
			</p>
		</div>
		<div class="acts">
			{#if !isNew && d.status === "published"}
				<Button variant="secondary" href="/scenario/{d.id}" target="_blank" rel="noopener"><ExternalLink aria-hidden="true" />As a learner</Button>
			{/if}
			<FloatingPanel bind:open={menu} label="More" align="end" role="menu" plainTrigger triggerClass="adm-icon more" class="w-52">
				{#snippet trigger()}
					<Ellipsis class="size-4" aria-hidden="true" />
				{/snippet}
				<button type="button" class="floating-menu-item" onclick={download}>
					<Download class="size-4 text-muted-foreground" aria-hidden="true" />Export JSON
				</button>
				<button
					type="button"
					class="floating-menu-item"
					onclick={() => {
						menu = false;
						jsonError = "";
						jsonOpen = true;
					}}
				>
					<FileUp class="size-4 text-muted-foreground" aria-hidden="true" />Import JSON
				</button>
				{#if d.status === "published"}
					<div class="menu-sep"></div>
					<button
						type="button"
						class="floating-menu-item"
						onclick={() => {
							menu = false;
							ask({
								title: "Withdraw this scenario?",
								text: "Learners stop finding it on the shelf and in the library. Pieces already written from it stay theirs.",
								act: "Withdraw",
								go: withdraw,
							});
						}}
					>
						<Undo2 class="size-4 text-muted-foreground" aria-hidden="true" />Withdraw
					</button>
				{:else if !isNew && !loaded?.written}
					<div class="menu-sep"></div>
					<button
						type="button"
						class="floating-menu-item"
						onclick={() => {
							menu = false;
							ask({
								title: "Delete this draft?",
								text: "Nobody has written in it. It is gone for good, and leaves any issue it was in.",
								act: "Delete",
								go: remove,
							});
						}}
					>
						<Trash2 class="size-4 text-muted-foreground" aria-hidden="true" />Delete
					</button>
				{/if}
			</FloatingPanel>
			{#if d.status === "published"}
				<Button onclick={() => trySave(false)} disabled={saving}>Save</Button>
			{:else}
				<Button variant="secondary" onclick={() => trySave(false)} disabled={saving}>Save draft</Button>
				<Button onclick={() => trySave(true)} disabled={saving}>{d.status === "withdrawn" ? "Publish again" : "Publish"}</Button>
			{/if}
		</div>
	</header>
	{#if problem}
		<p class="adm-paper pad problem" role="alert">{problem}</p>
	{/if}
	{#if from}
		<section class="adm-section first" aria-label="The learner's suggestion">
			<div class="adm-paper pad">
				<Accordion variant="plain" title="Made from a learner's suggestion" open={d.status === "draft"}>
					<Suggestion s={from} />
					{#if suggested}
						<div class="from-acts">
							<Button
								variant="secondary"
								size="sm"
								onclick={() => {
									pasted = suggested;
									importing = true;
								}}
								><ClipboardPaste aria-hidden="true" />Cut the opening from its capture</Button
							>
						</div>
					{/if}
				</Accordion>
			</div>
		</section>
	{/if}

	<section class="adm-section" class:first={!from} aria-labelledby="h-place">
		<h2 id="h-place">Place</h2>
		<div class="adm-paper pad adm-grid place" class:tr={translate}>
			<div class="adm-field">
				<span class="l" id="where-l"
					>Where
					{#if locked}
						<span class="lock" use:tip={"Learners have written in this scenario, so where it happens stays as it is."}
							><Lock class="size-3.5" aria-label="Fixed" /></span
						>
					{/if}</span
				>
				{#if locked}
					<input class="adm-input" value={SITES.find((x) => x.value === d.place)?.label} disabled aria-labelledby="where-l">
				{:else}
					<Select aria-label="Where" value={d.place} onValueChange={setPlace} items={SITES} />
				{/if}
			</div>
			<label class="adm-field">
				<span class="l">Minutes</span>
				<input class="adm-input" type="number" min="3" max="40" bind:value={d.minutes}>
			</label>
			{#if !translate}
				<div class="adm-field">
					<span class="l" id="urg-l">Replies come</span>
					<Select aria-label="Replies come" value={d.urgency ?? "medium"} onValueChange={(u) => (d.urgency = u as Urgency)} items={URGENCY} />
				</div>
				<label class="adm-field">
					<span class="l">Most turns</span>
					<input
						class="adm-input"
						type="number"
						min="1"
						placeholder="No limit"
						value={d.maxTurns ?? ""}
						oninput={(e) => (d.maxTurns = e.currentTarget.value ? Number(e.currentTarget.value) : null)}
					>
				</label>
			{:else}
				<div class="adm-field">
					<span class="l">Name table</span>
					<Select
						aria-label="Name table"
						value={d.workId ?? ""}
						onValueChange={(w) => (d.workId = w || null)}
						items={[{ value: "", label: "None (names as in the original)" }, ...(loaded?.works ?? []).map((w) => ({ value: w.id, label: w.title }))]}
					/>
				</div>
			{/if}
			{#if isNew}
				<label class="adm-field full">
					<span class="l">Id</span>
					<span class="h">In its address (/scenario/{d.id || "…"}); it cannot change once saved.</span>
					<input class="adm-input" bind:value={d.id} oninput={() => (idTouched = true)} placeholder="comment-on-a-fic" pattern="[a-z0-9-]{"{2,60}"}">
				</label>
			{/if}
		</div>
	</section>

	<section class="adm-section" aria-labelledby="h-ver">
		<div class="ver-head">
			<h2 id="h-ver">{translate ? "Original" : "Versions"}</h2>
			<span class="grow"></span>
			{#if Object.keys(d.versions).length > 1}
				<SegmentedControl
					label="Learning language"
					size="sm"
					bind:value={lang}
					items={Object.keys(d.versions).map((l) => ({ value: l, label: langEn(l) }))}
				/>
			{/if}
			{#if missing.length}
				<div class="w-40">
					<Select
						aria-label="Add a language"
						size="sm"
						variant="ghost"
						placeholder="Add a language"
						value=""
						onValueChange={addLanguage}
						items={missing.map((l) => ({ value: l, label: langEn(l) }))}
					/>
				</div>
			{/if}
		</div>
		<div class="adm-paper">
			<div class="ver-bar">
				{#if !translate}
					<SegmentedControl
						label="View"
						size="sm"
						bind:value={view}
						items={[
							{ value: "edit", label: "Edit" },
							{ value: "preview", label: "Preview" },
						]}
					/>
				{/if}
				{#if v}
					<!-- biome-ignore lint/a11y/noLabelWithoutControl: Checkbox renders a native checkbox inside the label -->
					<label class="hide"
						><Checkbox bind:checked={() => !!v.draft, (x) => (v.draft = x || undefined)} /><span>Hidden from learners in {langEn(lang)}</span></label
					>
				{/if}
				<span class="grow"></span>
				{#if ["ao3", "reddit", "discord"].includes(d.place)}
					<Button variant="ghost" size="sm" onclick={() => (importing = true)}><ClipboardPaste aria-hidden="true" />Import a capture</Button>
				{/if}
				{#if Object.keys(d.versions).length > 1}
					<Button variant="ghost" size="sm" onclick={removeLanguage}><X aria-hidden="true" />Remove {langEn(lang)}</Button>
				{/if}
			</div>
			{#if view === "preview" && ev && preview}
				<div class="preview">
					<div class="card-wrap">
						<ScenarioCard site={SITE_OF[d.place]} title={ev.title || "Untitled"} line={ev.line} meta="{d.minutes} min" />
					</div>
					<div class="sit">
						{#if ev.introduction}
							<p class="intro" {lang}>{ev.introduction}</p>
						{/if}
						<Situation s={preview} {lang} />
					</div>
				</div>
			{:else if view === "preview" && ev}
				<p class="pad none">The opening is not complete yet, so there is nothing to show.</p>
			{:else if v}
				<div class="pad adm-grid">
					<label class="adm-field full"><span class="l">Title</span><input class="adm-input" bind:value={v.title} {lang}></label>
					<label class="adm-field full"><span class="l">Line on the card</span><input class="adm-input" bind:value={v.line} {lang}></label>
					<label class="adm-field full">
						<span class="l">Introduction</span>
						<span class="h"
							>{translate
								? "Shown to learners with the source, and read by every model: who wants it and why."
								: "Shown to learners above the scene, and read by every model: what a newcomer would not know (the game, what happened before). Most scenarios need none."}</span
						>
						<textarea
							class="adm-input"
							rows="2"
							use:autogrow={v.introduction}
							bind:value={() => v.introduction ?? "", (x) => (v.introduction = x)}
							{lang}
						></textarea>
					</label>
					{#if tv}
						<label class="adm-field">
							<span class="l">Where it appears</span>
							<input class="adm-input" bind:value={tv.where} placeholder="a post in r/WarriorCats">
						</label>
						<label class="adm-field">
							<span class="l">Who reads it</span>
							<input class="adm-input" bind:value={tv.readers} placeholder="fans who have read the books">
						</label>
						<label class="adm-field full">
							<span class="l">Text, as first written in {langEn(lang)}</span>
							<textarea class="adm-input" rows="8" use:autogrow={tv.original} bind:value={tv.original} {lang}></textarea>
						</label>
					{:else if ev}
						<div class="full rule" role="presentation"></div>
						<div class="full">
							<OpeningEditor place={d.place as ExchangePlace} opening={ev.opening as Record<string, unknown>} comments={threads[lang] ?? []} {lang} />
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</section>

	{#snippet termList(list: string[], id: string, heading: string, hint: string)}
		<section class="adm-section" aria-labelledby={id}>
			<h2 {id}>{heading} <span class="n">{list.length}</span></h2>
			<div class="adm-paper">
				{#if list.length}
					<ul class="adm-rows">
						{#each list as _, i (i)}
							<li class="term">
								<input class="adm-input plain" bind:value={list[i]} aria-label="Term" placeholder="Term, as in the original" {lang}>
								<button type="button" class="adm-icon" aria-label="Remove {list[i]}" use:tip={"Remove"} onclick={() => list.splice(i, 1)}>
									<X class="size-4" aria-hidden="true" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="foot" class:only={!list.length}>
					<Button variant="ghost" size="sm" onclick={() => list.push("")}><Plus aria-hidden="true" />Add a term</Button>
					<span class="h grow">{hint}</span>
					<a class="text-link" href="/admin/names">How names are written</a>
				</div>
			</div>
		</section>
	{/snippet}
	{#if tv}
		{@render termList(tv.terms, "h-terms", "Terms the source must give", "The model finds the others; what each means is written with each source.")}
		{@render termList(tv.leaveOut, "h-out", "Terms it must not give", "What the learner is here to learn, which the model would give otherwise.")}

		{#if !isNew}
			<section class="adm-section" aria-labelledby="h-src">
				<h2 id="h-src">Sources</h2>
				<div class="adm-paper">
					{#if sources.length}
						<ul class="adm-rows">
							{#each sources as r (r.id)}
								{@const n = notesOf(r.notes)}
								<li class="src">
									<div class="src-head">
										<span class="nm">{langEn(r.native)}{Object.keys(d.versions).length > 1 ? ` → ${langEn(r.language)}` : ""}</span>
										<span class="adm-tag {STATE[r.state].tone}">{STATE[r.state].label}{n.edited ? ", edited" : ""}</span>
										<span class="grow"></span>
										{#if r.text && r.state !== "pending" && editing?.id !== r.id}
											<button type="button" class="adm-icon" aria-label="Edit" use:tip={"Edit"} onclick={() => edit(r)}>
												<Pencil class="size-4" aria-hidden="true" />
											</button>
										{/if}
										{#if r.state !== "pending"}
											<button
												type="button"
												class="adm-icon"
												aria-label="Make again"
												use:tip={"Make again"}
												onclick={() => guarded(n.edited ? [r] : [], () => sourceAct(remake, r))}
											>
												<RotateCcw class="size-4" aria-hidden="true" />
											</button>
										{/if}
										{#if r.state === "checked" || (r.state === "notes" && !n.names?.length)}
											<Button size="sm" onclick={() => sourceAct(confirm, r)}>Confirm</Button>
										{/if}
									</div>
									{#if n.names?.length}
										<p class="src-why">
											Waiting for names to be confirmed: {n.names.join(", ")}.
											<a class="text-link" href="/admin/names">Name tables</a>, then make it again.
										</p>
									{:else if n.error}
										<p class="src-why">{n.error}</p>
									{/if}
									{#if editing?.id === r.id}
										<div class="src-edit">
											<input class="adm-input" bind:value={editing.title} aria-label="Title" lang={r.native}>
											<textarea
												class="adm-input"
												rows="6"
												use:autogrow={editing.text}
												bind:value={editing.text}
												aria-label="Source"
												lang={r.native}
											></textarea>
											{#each editing.glossary as g, i (i)}
												<div class="gl">
													{#each GLOSS as [k, label]}
														<input
															class="adm-input"
															bind:value={g[k]}
															aria-label={label}
															placeholder={label}
															lang={k === "term" ? r.language : r.native}
														>
													{/each}
													<button
														type="button"
														class="adm-icon"
														aria-label="Remove {g.term}"
														use:tip={"Remove"}
														onclick={() => editing?.glossary.splice(i, 1)}
													>
														<X class="size-4" aria-hidden="true" />
													</button>
												</div>
											{/each}
											{#if editProblem}
												<p class="src-why" role="alert">{editProblem}</p>
											{/if}
											<div class="foot only">
												<Button variant="ghost" size="sm" onclick={() => editing?.glossary.push({ term: "", shown: "", gloss: "" })}
													><Plus aria-hidden="true" />Add a term</Button
												>
												<span class="grow"></span>
												<Button variant="secondary" size="sm" onclick={() => (editing = null)}>Cancel</Button>
												<Button size="sm" onclick={() => saveEdit(r)}>Confirm as edited</Button>
											</div>
										</div>
									{:else if n.issues?.length || r.text}
										<Accordion
											variant="plain"
											title={n.issues?.length ? `${n.issues.length} ${n.issues.length > 1 ? "notes" : "note"} from the check` : "The source"}
											class="src-acc"
										>
											{#if n.issues?.length}
												<ul class="notes">
													{#each n.issues as x}
														<li>¶{x.paragraph} · {x.kind}: “{x.original}” / “{x.source}”: {x.note}</li>
													{/each}
												</ul>
											{/if}
											{#if r.title}
												<p class="src-title" lang={r.native}>{r.title}</p>
											{/if}
											{#if r.text}
												<p class="src-text" lang={r.native}>{r.text}</p>
											{/if}
											{#if r.glossary.length}
												<ul class="notes">
													{#each r.glossary as g}
														<li><span lang={r.language}>{g.term}</span> → <span lang={r.native}>{g.shown}</span>: {g.gloss}</li>
													{/each}
												</ul>
											{/if}
										</Accordion>
									{/if}
								</li>
							{/each}
						</ul>
					{:else}
						<p class="adm-empty">Sources are made for every learner language when it is published.</p>
					{/if}
				</div>
			</section>
		{/if}
	{:else if ev}
		<section class="adm-section" aria-labelledby="h-sim">
			<h2 id="h-sim">Conversation{Object.keys(d.versions).length > 1 ? ` · ${langEn(lang)}` : ""}</h2>
			<div class="adm-paper pad adm-grid">
				<label class="adm-field full"
					><span class="l">The learner is</span>
					<input class="adm-input" bind:value={ev.you} placeholder="A reader who followed the fic for two years"></label
				>
				<div class="adm-field full">
					<span class="l">What they want</span>
					{#each ev.goals as _, i (i)}
						<div class="msg">
							<input class="adm-input" bind:value={ev.goals[i]} aria-label="Goal {i + 1}" {lang}>
							<button type="button" class="adm-icon" aria-label="Remove goal" onclick={() => ev.goals.splice(i, 1)}>
								<X class="size-4" aria-hidden="true" />
							</button>
						</div>
					{/each}
					<div>
						<Button variant="ghost" size="sm" onclick={() => ev.goals.push("")}><Plus aria-hidden="true" />Add a goal</Button>
					</div>
				</div>
				<div class="adm-field full">
					<span class="l">People</span>
					<span class="h">The first is whom the learner answers.</span>
					<ul class="cast">
						{#each ev.people as c, i (i)}
							<li class="person">
								<div class="ph">
									<input class="adm-input who" bind:value={c.name} aria-label="Name" placeholder="Name">
									<input class="adm-input" bind:value={c.who} aria-label="Who {c.name} is" placeholder="Who they are, in a few words">
									<button
										type="button"
										class="adm-icon"
										aria-label="Remove {c.name}"
										use:tip={"Remove"}
										disabled={ev.people.length < 2}
										onclick={() => ev.people.splice(i, 1)}
									>
										<X class="size-4" aria-hidden="true" />
									</button>
								</div>
								<textarea
									class="adm-input notes"
									rows="2"
									use:autogrow={c.notes}
									bind:value={c.notes}
									aria-label="Notes on {c.name}"
									placeholder="How they take what the learner says, what they will and will not do, what they know"
								></textarea>
							</li>
						{/each}
					</ul>
					{#if unlisted.length}
						<p class="unlisted">
							<span>In the opening, not here yet:</span>
							{#each unlisted as n (n)}
								<button type="button" class="add-person" onclick={() => ev.people.push({ name: n, who: "", notes: "" })}>
									<Plus class="size-3.5" aria-hidden="true" />{n}
								</button>
							{/each}
						</p>
					{/if}
					<div>
						<Button variant="ghost" size="sm" onclick={() => ev.people.push({ name: "", who: "", notes: "" })}
							><Plus aria-hidden="true" />Add someone</Button
						>
					</div>
				</div>
				<div class="full">
					<Accordion variant="plain" title="Others who may turn up" open={!!ev.others}>
						<p class="h">On a public thread or channel: the kind of people who pass by. Without it, nobody else joins.</p>
						<textarea
							class="adm-input"
							rows="2"
							use:autogrow={ev.others}
							bind:value={ev.others}
							aria-label="Others who may turn up"
							placeholder="The kind of people who pass by here. Their names are drawn when they appear."
						></textarea>
					</Accordion>
					<Accordion variant="plain" title={ev.followed.length ? `What really followed · ${ev.followed.length}` : "What really followed"}>
						<p class="h">From the capture: what was said after the opening. The people draw on it; learners never see it.</p>
						{#if ev.followed.length}
							<ul class="followed">
								{#each ev.followed as f, i (i)}
									<li>
										<b>{f.author}</b><span>{f.text}</span
										><button type="button" class="adm-icon" aria-label="Remove" onclick={() => ev.followed.splice(i, 1)}>
											<X class="size-4" aria-hidden="true" />
										</button>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="none">Nothing yet. Import a capture to keep what came after the opening.</p>
						{/if}
					</Accordion>
				</div>
			</div>
		</section>
	{/if}
</div>

<CaptureImport
	bind:open={importing}
	site={SITE_OF[d.place]}
	place={d.place as ExchangePlace}
	{lang}
	people={ev?.people ?? []}
	bind:pasted
	onimport={importCapture}
/>

<ModalDialog bind:open={jsonOpen} labelledby="json-h">
	<h2 id="json-h" class="mb-2">Import JSON</h2>
	<p class="imp-p">Paste a scenario exported by Export JSON. It replaces what is on this page until you save.</p>
	<textarea
		class="adm-input mono"
		rows="8"
		bind:value={json}
		oninput={() => (jsonError = "")}
		aria-label="Scenario JSON"
		aria-invalid={!!jsonError}
		data-initial-focus
	></textarea>
	{#if jsonError}
		<p class="err" role="alert">{jsonError}</p>
	{/if}
	<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (jsonOpen = false)}>Cancel</Button>
		<Button disabled={!json.trim()} onclick={importJson}>Import</Button>
	</div>
</ModalDialog>

<ModalDialog bind:open={askOpen} labelledby="ask-h">
	<h2 id="ask-h" class="mb-2">{asking.title}</h2>
	<p class="imp-p">{asking.text}</p>
	<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (askOpen = false)} data-initial-focus>Cancel</Button>
		<Button
			variant="destructive-solid"
			onclick={() => {
				askOpen = false;
				asking.go();
			}}
			>{asking.act}</Button
		>
	</div>
</ModalDialog>

<style>
.ttl {
	min-width: 0;
}
.problem {
	margin: 0 0 16px;
	color: var(--warn);
	font-size: 14px;
	white-space: pre-line;
}
.hide {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin-left: 12px;
	font-size: 13px;
	color: var(--muted);
}
.src-why {
	margin: 6px 0 0;
	font-size: 13.5px;
	color: var(--ink-2);
}
.src-title {
	margin: 8px 0 0;
	font-weight: 600;
}
.ttl .adm-meta {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 8px;
}
.adm-section.first {
	margin-top: 8px;
}
.from-acts {
	display: flex;
	justify-content: flex-end;
	margin-top: 12px;
}
.place {
	grid-template-columns: 12rem 7rem 14rem 8rem;
}
.place.tr {
	grid-template-columns: 12rem 7rem minmax(0, 1fr);
}
@container (max-width: 760px) {
	.place {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
	}
}
.lock {
	display: inline-flex;
	margin-left: 6px;
	vertical-align: -2px;
	color: var(--muted);
}
.acts :global(.more) {
	width: 40px;
	height: 40px;
}
.intro {
	margin: 0 0 14px;
	color: var(--ink-2);
	font-size: 14.5px;
	line-height: 1.6;
}
.cast {
	display: grid;
	gap: 10px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.person {
	display: grid;
	gap: 6px;
	padding: 10px;
	border-radius: 6px;
	background: var(--well);
}
.ph {
	display: flex;
	gap: 8px;
}
.ph .who {
	flex: 0 0 11rem;
}
.ph .adm-input:not(.who) {
	flex: 1;
	min-width: 0;
}
@container (max-width: 560px) {
	.ph {
		flex-wrap: wrap;
	}
	.ph .who {
		flex: 1 1 60%;
	}
	.ph .adm-input:not(.who) {
		flex: 1 1 100%;
		order: 3;
	}
}
.notes {
	min-height: 60px;
}
.unlisted {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	margin: 2px 0 0;
	color: var(--muted);
	font-size: 13px;
}
.add-person {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	height: 28px;
	padding: 0 9px 0 7px;
	border: 1px dashed var(--line);
	border-radius: 5px;
	background: none;
	color: var(--ink-2);
	font-size: 13px;
	cursor: pointer;
	transition:
		background-color 150ms,
		scale 150ms;
}
.add-person:hover {
	background: var(--hover);
}
.add-person:active {
	scale: 0.97;
}
.add-person:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
@media (pointer: coarse) {
	.add-person {
		height: 40px;
	}
}
.h {
	margin: 0 0 8px;
	font-size: 12.5px;
	line-height: 1.45;
	color: var(--muted);
}
.followed {
	display: grid;
	gap: 6px;
	margin: 0 0 8px;
	padding: 0;
	list-style: none;
}
.followed li {
	display: flex;
	align-items: flex-start;
	gap: 10px;
	padding: 6px 4px 6px 10px;
	border-radius: 6px;
	background: var(--well);
	font-size: 14px;
	line-height: 1.5;
}
.followed b {
	flex: none;
	font-weight: 500;
}
.followed span {
	flex: 1;
	min-width: 0;
	color: var(--ink-2);
}
.none {
	margin: 0 0 8px;
	color: var(--muted);
	font-size: 13.5px;
}
.foot.only {
	border-top: 0;
}
.mono {
	font:
		12.5px / 1.5 ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
}
.err {
	margin: 8px 0 0;
	color: var(--bad);
	font-size: 13px;
}
.pad {
	padding: 18px 20px 20px;
}
.ver-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	margin-bottom: 10px;
}
.ver-head h2 {
	font-size: 21px;
}
.grow {
	flex: 1;
}
.ver-bar {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-bottom: 1px solid var(--line-soft);
}
.rule {
	height: 1px;
	margin: 2px 0;
	background: var(--line-soft);
}
.msg {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}
.msg .adm-icon {
	margin-top: 4px;
}
@container (max-width: 560px) {
	.msg {
		flex-wrap: wrap;
	}
}
.preview {
	display: grid;
	grid-template-columns: 15rem minmax(0, 1fr);
	gap: 24px;
	align-items: start;
	padding: 20px;
}
@container (max-width: 700px) {
	.preview {
		grid-template-columns: minmax(0, 1fr);
	}
}
.card-wrap {
	max-width: 15rem;
}
.sit {
	min-width: 0;
}
.term {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px 8px 12px;
}
.term .adm-input.plain:first-child {
	flex: 1;
}
.adm-input.plain {
	border-color: transparent;
	background: transparent;
}
.adm-input.plain:hover {
	border-color: var(--line);
}
.adm-input.plain:focus {
	background: var(--field);
}
.foot {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 8px 12px 10px;
	border-top: 1px solid var(--line-soft);
	font-size: 13.5px;
}
.src {
	padding: 10px 16px;
}
.src-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-height: 40px;
}
.src-head .nm {
	font-size: 15px;
}
.src-edit {
	display: grid;
	gap: 8px;
	margin: 6px 0 10px;
}
.gl {
	display: grid;
	grid-template-columns: 1fr 1fr 2fr auto;
	gap: 6px;
	align-items: center;
}
.src :global(.src-acc) {
	margin-top: 4px;
}
.notes {
	margin: 0 0 10px;
	padding-left: 18px;
	color: var(--ink-2);
	font-size: 14px;
	line-height: 1.55;
}
.notes li + li {
	margin-top: 4px;
}
.src-text {
	margin: 0 0 8px;
	padding: 10px 12px;
	border-radius: 6px;
	background: var(--well);
	font-size: 14px;
	line-height: 1.7;
}
.imp-p {
	margin: 0 0 14px;
	color: var(--muted);
	font-size: 14px;
}
</style>
