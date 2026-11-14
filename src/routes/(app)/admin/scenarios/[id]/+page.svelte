<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ClipboardPaste from "@lucide/svelte/icons/clipboard-paste";
import Download from "@lucide/svelte/icons/download";
import Ellipsis from "@lucide/svelte/icons/ellipsis";
import ExternalLink from "@lucide/svelte/icons/external-link";
import FileUp from "@lucide/svelte/icons/file-up";
import Lock from "@lucide/svelte/icons/lock";
import Plus from "@lucide/svelte/icons/plus";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Undo2 from "@lucide/svelte/icons/undo-2";
import X from "@lucide/svelte/icons/x";
import { page } from "$app/state";
import CaptureImport from "$lib/components/admin/CaptureImport.svelte";
import OpeningEditor from "$lib/components/admin/OpeningEditor.svelte";
import Accordion from "$lib/components/common/Accordion.svelte";
import FloatingPanel from "$lib/components/common/FloatingPanel.svelte";
import ModalDialog from "$lib/components/common/ModalDialog.svelte";
import { autogrow } from "$lib/components/common/motion";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import Select from "$lib/components/common/Select.svelte";
import { tip } from "$lib/components/common/tip";
import ScenarioCard from "$lib/components/home/ScenarioCard.svelte";
import Situation from "$lib/components/scenario/Situation.svelte";
import Button from "$lib/components/ui/button/button.svelte";
import { fmtDay, langEn, type SimExtra, SOURCES, type SourceRow, scenarioStatus, simExtra, URGENCY, written } from "$lib/demo/admin";
import { toast } from "$lib/demo/app.svelte";
import { SCENARIOS, type Scenario, SIMS, type Sim, type Situation as Sit } from "$lib/demo/scenarios";

/*
 * One scenario. A place scenario: where it happens and how the simulation paces it; each learning language's version
 * (title, the card's line, the introduction learners and every model read, and the opening in the place's own terms,
 * written or imported from a page capture); then the conversation: who the learner is, what they want, each person
 * there with their notes, who else may turn up, and how the real conversation went on (from the capture; learners
 * never see it). A translation: the original, its terms, and a source per learner language, checked, then confirmed
 * or made again. Once learners have written in it, where it happens is fixed. Export and import carry a scenario
 * between developers' machines as JSON.
 */
const KIND: Record<string, Sit["kind"]> = { AO3: "ao3", Reddit: "reddit", Email: "email", Discord: "chat", iMessage: "chat", Translate: "translate" };
const isNew = $derived(page.params.id === "new");
const blankSim = (): Sim => ({ you: "", goals: [""], cast: [], mine: [], ending: [] });
const blank = (): Scenario => ({
	id: "new",
	site: "Reddit",
	min: 10,
	added: new Date().toISOString().slice(0, 10),
	title: { en: "" },
	line: { en: "" },
	brief: { en: "" },
	situation: { en: emptySituation("Reddit") },
});
const found = $derived(isNew ? undefined : SCENARIOS.find((x) => x.id === page.params.id));
let s = $state<Scenario>(blank());
let sim = $state<Sim>(blankSim());
let extra = $state<SimExtra>(simExtra(""));
let sources = $state<SourceRow[]>([]);
let status = $state<"draft" | "published" | "withdrawn">("draft");
let lang = $state("en");
let view = $state("edit");
$effect.pre(() => {
	const src = found ?? blank();
	s = structuredClone($state.snapshot(src) as Scenario);
	sim = structuredClone(SIMS[src.id] ?? blankSim());
	extra = simExtra(src.id);
	sources = structuredClone(SOURCES[src.id] ?? []);
	status = found && scenarioStatus(found.id) !== "draft" ? "published" : "draft";
	lang = Object.keys(src.situation)[0] ?? "en";
});
const translate = $derived(s.site === "Translate");
/** Learners have written in it: where it happens (and so its kind) stays. */
const locked = $derived(!isNew && status !== "draft" && written(s.id) > 0);
let importing = $state(false);
let menu = $state(false);
let jsonOpen = $state(false);
let json = $state("");
let withdrawing = $state(false);
const sit = $derived(s.situation[lang] as Sit | undefined);
const SITES = ["AO3", "Reddit", "Email", "Discord", "iMessage", "Translate"].map((v) => ({ value: v, label: v === "Translate" ? "Translation" : v }));
const LEARNABLE = ["en", "es", "fr", "ja"];
const NATIVE = ["zh-CN", "ja", "es", "fr", "de", "ko"];
const missing = $derived(LEARNABLE.filter((l) => !s.situation[l]));
function emptySituation(site: string): Sit {
	const k = KIND[site];
	if (k === "ao3") return { kind: "ao3", work: "", author: "", chapter: "", excerpt: "", note: "" };
	if (k === "reddit") return { kind: "reddit", sub: "", title: "", author: "", body: "", comments: [] };
	if (k === "email") return { kind: "email", from: "", subject: "", body: "" };
	if (k === "translate") return { kind: "translate", brief: "", source: "", sourceLang: "", original: "", glossary: [], where: "", readers: "" };
	return { kind: "chat", place: "", messages: [] };
}
function setSite(v: string) {
	const was = s.site;
	s.site = v as Scenario["site"];
	if (v === "Translate") {
		s.situation = { en: emptySituation(v) };
		lang = "en";
		sources = NATIVE.map((l) => ({ lang: l, state: "none", notes: [] }));
		return;
	}
	if (was === "Translate") s.situation = { en: emptySituation(v) };
	for (const l of Object.keys(s.situation)) if (s.situation[l].kind !== KIND[v]) s.situation[l] = emptySituation(v);
}
function addLanguage(l: string) {
	s.situation[l] = emptySituation(s.site);
	s.title[l] = "";
	s.line[l] = "";
	s.brief[l] = "";
	lang = l;
	view = "edit";
}
function save(publish: boolean) {
	if (publish) status = "published";
	toast(
		publish
			? translate
				? "Published: sources are being made for each learner language (demo)"
				: "Published (demo: nothing is stored)"
			: "Saved (demo: nothing is stored)",
	);
}
/** Everything a scenario is, as one JSON a developer can hand to another. */
const exported = () =>
	JSON.stringify({ scenario: $state.snapshot(s), conversation: { ...$state.snapshot(sim), ...$state.snapshot(extra) } }, null, 2);
function download() {
	menu = false;
	const a = document.createElement("a");
	a.href = URL.createObjectURL(new Blob([exported()], { type: "application/json" }));
	a.download = `scenario-${s.id}.json`;
	a.click();
	URL.revokeObjectURL(a.href);
}
let jsonError = $state("");
function importJson() {
	try {
		const v = JSON.parse(json);
		if (!v?.scenario?.situation) throw new Error("not a scenario");
		if (locked && v.scenario.site !== s.site) throw new Error("learners have written in this scenario, so where it happens cannot change");
		s = { ...v.scenario, id: s.id };
		if (v.conversation) {
			const { urgency, maxTurns, notes, others, followed, ...rest } = v.conversation;
			sim = { ...blankSim(), ...rest };
			extra = { ...simExtra(""), urgency, maxTurns, notes: notes ?? {}, others: others ?? "", followed: followed ?? [] };
		}
		lang = Object.keys(s.situation)[0] ?? "en";
		jsonOpen = false;
		json = "";
		toast("Imported: review it, then save");
	} catch (e) {
		jsonError = e instanceof SyntaxError ? "That is not valid JSON." : `It cannot be imported: ${(e as Error).message}.`;
	}
}
/** Who speaks in the opening: each of them is one of the People, with notes like anyone else. */
const speakers = (x: Sit | undefined): string[] => {
	if (!x) return [];
	if (x.kind === "reddit") return [x.author, ...x.comments.map((c) => c.author)];
	if (x.kind === "chat") return x.messages.map((m) => m.author);
	if (x.kind === "email") return [x.from];
	if (x.kind === "ao3") return [x.author];
	return [];
};
const unlisted = $derived([
	...new Set(
		speakers(sit)
			.map((n) => n.trim())
			.filter((n) => n && !sim.cast.some((c) => c.name.trim() === n)),
	),
]);
const STATE: Record<SourceRow["state"], { label: string; tone: string }> = {
	confirmed: { label: "Confirmed", tone: "ok" },
	checked: { label: "Checked, to confirm", tone: "" },
	notes: { label: "Checker notes", tone: "warn" },
	none: { label: "Not made yet", tone: "" },
};
</script>

<div class="adm-page">
	<a class="adm-back" href="/admin/scenarios"><ArrowLeft class="size-4" aria-hidden="true" />Scenarios</a>
	<header class="adm-head">
		<div class="ttl">
			<h1>{isNew ? "New scenario" : s.title.en || "Untitled"}</h1>
			<p class="adm-meta">
				{#if status === "draft"}
					<span class="adm-tag">Draft</span>
				{:else if status === "withdrawn"}
					<span class="adm-tag">Withdrawn</span>
				{:else}
					<span class="adm-tag ok">Published</span>
				{/if}
				{#if !isNew}
					<span class="since"
						>Added
						{fmtDay(s.added)}
						{#if written(s.id) && status !== "draft"}
							{" · "}{written(s.id)}
							pieces written
						{/if}</span
					>
				{/if}
			</p>
		</div>
		<div class="acts">
			{#if !isNew}
				<Button variant="secondary" href="/scenario/{s.id}" target="_blank" rel="noopener"><ExternalLink aria-hidden="true" />As a learner</Button>
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
				{#if status === "published"}
					<div class="menu-sep"></div>
					<button
						type="button"
						class="floating-menu-item"
						onclick={() => {
							menu = false;
							withdrawing = true;
						}}
					>
						<Undo2 class="size-4 text-muted-foreground" aria-hidden="true" />Withdraw
					</button>
				{/if}
			</FloatingPanel>
			{#if status === "published"}
				<Button onclick={() => save(false)}>Save</Button>
			{:else}
				<Button variant="secondary" onclick={() => save(false)}>Save draft</Button>
				<Button onclick={() => save(true)}>{status === "withdrawn" ? "Publish again" : "Publish"}</Button>
			{/if}
		</div>
	</header>

	<section class="adm-section first" aria-labelledby="h-place">
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
					<input class="adm-input" value={SITES.find((x) => x.value === s.site)?.label} disabled aria-labelledby="where-l">
				{:else}
					<Select
						aria-label="Where"
						value={s.site}
						onValueChange={setSite}
						items={isNew || translate ? SITES : SITES.filter((x) => x.value !== "Translate")}
					/>
				{/if}
			</div>
			<label class="adm-field">
				<span class="l">Minutes</span>
				<input class="adm-input" type="number" min="3" max="40" bind:value={s.min}>
			</label>
			{#if !translate}
				<div class="adm-field">
					<span class="l" id="urg-l">Replies come</span>
					<Select aria-label="Replies come" bind:value={extra.urgency} items={URGENCY} />
				</div>
				<label class="adm-field">
					<span class="l">Most turns</span>
					<input
						class="adm-input"
						type="number"
						min="1"
						placeholder="No limit"
						value={extra.maxTurns ?? ""}
						oninput={(e) => (extra.maxTurns = e.currentTarget.value ? Number(e.currentTarget.value) : null)}
					>
				</label>
			{/if}
			<label class="adm-field full">
				<span class="l">Title in English</span>
				<input class="adm-input" bind:value={s.title.en} placeholder={translate ? "Translate a café's new menu" : "Comment on a fic you loved"}>
			</label>
		</div>
	</section>

	{#if translate && sit?.kind === "translate"}
		{@const t = sit}
		<section class="adm-section" aria-labelledby="h-orig">
			<h2 id="h-orig">Original</h2>
			<div class="adm-paper pad adm-grid">
				<label class="adm-field full">
					<span class="l">Introduction</span>
					<span class="h">Shown to learners with the source, and read by every model.</span>
					<textarea class="adm-input" rows="2" use:autogrow={s.brief.en} bind:value={s.brief.en}></textarea>
				</label>
				<label class="adm-field">
					<span class="l">Where it appears</span>
					<input class="adm-input" bind:value={t.where} placeholder="a post in r/WarriorCats">
				</label>
				<label class="adm-field">
					<span class="l">Who reads it</span>
					<input class="adm-input" bind:value={t.readers} placeholder="fans who have read the books">
				</label>
				<label class="adm-field full">
					<span class="l">Text, as first written in English</span>
					<textarea class="adm-input" rows="8" use:autogrow={t.original} bind:value={t.original} lang="en"></textarea>
				</label>
			</div>
		</section>

		<section class="adm-section" aria-labelledby="h-terms">
			<h2 id="h-terms">Terms <span class="n">{t.glossary?.length ?? 0}</span></h2>
			<div class="adm-paper">
				{#if t.glossary?.length}
					<ul class="adm-rows">
						{#each t.glossary as g, i (i)}
							<li class="term">
								<input class="adm-input plain" bind:value={g.term} aria-label="Term" placeholder="Term">
								<input
									class="adm-input plain"
									bind:value={g.gloss}
									aria-label="What a learner is told about {g.term}"
									placeholder="What a learner is told about it"
								>
								<button type="button" class="adm-icon" aria-label="Remove {g.term}" use:tip={"Remove"} onclick={() => t.glossary?.splice(i, 1)}>
									<X class="size-4" aria-hidden="true" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				<div class="foot" class:only={!t.glossary?.length}>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => {
							t.glossary ??= [];
							t.glossary.push({ term: "", shown: "", gloss: "" });
						}}
						><Plus aria-hidden="true" />Add a term</Button
					>
					<a class="text-link" href="/admin/names">How names are written per language</a>
				</div>
			</div>
		</section>

		<section class="adm-section" aria-labelledby="h-src">
			<h2 id="h-src">Sources</h2>
			<div class="adm-paper">
				<ul class="adm-rows">
					{#each sources as r (r.lang)}
						<li class="src">
							<div class="src-head">
								<span class="nm">{langEn(r.lang)}</span>
								<span class="adm-tag {STATE[r.state].tone}">{STATE[r.state].label}</span>
								<span class="grow"></span>
								{#if r.state === "none"}
									<Button variant="secondary" size="sm" disabled={!t.original?.trim()} onclick={() => toast("Making the source (demo)")}>Make</Button>
								{:else}
									<button
										type="button"
										class="adm-icon"
										aria-label="Make again"
										use:tip={"Make again"}
										onclick={() => toast("Making it again (demo)")}
									>
										<RotateCcw class="size-4" aria-hidden="true" />
									</button>
									{#if r.state !== "confirmed"}
										<Button size="sm" onclick={() => (r.state = "confirmed")}>Confirm</Button>
									{/if}
								{/if}
							</div>
							{#if r.notes.length || r.text}
								<Accordion variant="plain" title={r.notes.length ? `${r.notes.length} notes from the check` : "The source"} class="src-acc">
									{#if r.notes.length}
										<ul class="notes">
											{#each r.notes as n}
												<li>{n}</li>
											{/each}
										</ul>
									{/if}
									{#if r.text}
										<p class="src-text" lang={r.lang}>{r.text}</p>
									{/if}
								</Accordion>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		</section>
	{:else}
		<section class="adm-section" aria-labelledby="h-ver">
			<div class="ver-head">
				<h2 id="h-ver">Versions</h2>
				<span class="grow"></span>
				{#if Object.keys(s.situation).length > 1}
					<SegmentedControl
						label="Learning language"
						size="sm"
						bind:value={lang}
						items={Object.keys(s.situation).map((l) => ({ value: l, label: langEn(l) }))}
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
					<SegmentedControl
						label="View"
						size="sm"
						bind:value={view}
						items={[
							{ value: "edit", label: "Edit" },
							{ value: "preview", label: "Preview" },
						]}
					/>
					<span class="grow"></span>
					{#if ["AO3", "Reddit", "Discord"].includes(s.site)}
						<Button variant="ghost" size="sm" onclick={() => (importing = true)}><ClipboardPaste aria-hidden="true" />Import a capture</Button>
					{/if}
				</div>
				{#if view === "preview" && sit}
					<div class="preview">
						<div class="card-wrap">
							<ScenarioCard site={s.site} title={s.title[lang] || s.title.en || "Untitled"} line={s.line[lang] ?? ""} meta="{s.min} min" />
						</div>
						<div class="sit">
							{#if s.brief[lang]}
								<p class="intro" {lang}>{s.brief[lang]}</p>
							{/if}
							<Situation s={sit} {lang} />
						</div>
					</div>
				{:else if sit}
					<div class="pad adm-grid">
						{#if lang !== "en"}
							<label class="adm-field full"><span class="l">Title</span><input class="adm-input" bind:value={s.title[lang]} {lang}></label>
						{/if}
						<label class="adm-field full"><span class="l">Line on the card</span><input class="adm-input" bind:value={s.line[lang]} {lang}></label>
						<label class="adm-field full">
							<span class="l">Introduction</span>
							<span class="h"
								>Shown to learners above the scene, and read by every model: what a newcomer would not know (the game, what happened before). Most
								scenarios need none.</span
							>
							<textarea class="adm-input" rows="2" use:autogrow={s.brief[lang]} bind:value={s.brief[lang]} {lang}></textarea>
						</label>
						<div class="full rule" role="presentation"></div>
						<div class="full"><OpeningEditor s={sit} {lang} /></div>
					</div>
				{/if}
			</div>
		</section>

		<section class="adm-section" aria-labelledby="h-sim">
			<h2 id="h-sim">Conversation</h2>
			<div class="adm-paper pad adm-grid">
				<label class="adm-field full"
					><span class="l">The learner is</span>
					<input class="adm-input" bind:value={sim.you} placeholder="A reader who followed the fic for two years"></label
				>
				<div class="adm-field full">
					<span class="l">What they want</span>
					{#each sim.goals as _, i (i)}
						<div class="msg">
							<input class="adm-input" bind:value={sim.goals[i]} aria-label="Goal {i + 1}">
							<button type="button" class="adm-icon" aria-label="Remove goal" onclick={() => sim.goals.splice(i, 1)}>
								<X class="size-4" aria-hidden="true" />
							</button>
						</div>
					{/each}
					<div>
						<Button variant="ghost" size="sm" onclick={() => sim.goals.push("")}><Plus aria-hidden="true" />Add a goal</Button>
					</div>
				</div>
				<div class="adm-field full">
					<span class="l">People</span>
					<ul class="cast">
						{#each sim.cast as c, i (i)}
							<li class="person">
								<div class="ph">
									<input class="adm-input who" bind:value={c.name} aria-label="Name" placeholder="Name">
									<input class="adm-input" bind:value={c.who} aria-label="Who {c.name} is" placeholder="Who they are, in a few words">
									<button type="button" class="adm-icon" aria-label="Remove {c.name}" use:tip={"Remove"} onclick={() => sim.cast.splice(i, 1)}>
										<X class="size-4" aria-hidden="true" />
									</button>
								</div>
								<textarea
									class="adm-input notes"
									rows="2"
									use:autogrow={extra.notes[c.name]}
									bind:value={() => extra.notes[c.name] ?? "", (v) => (extra.notes[c.name] = v)}
									aria-label="Notes on {c.name}"
									placeholder="What they want, what they know that the learner needs"
								></textarea>
							</li>
						{/each}
					</ul>
					{#if unlisted.length}
						<p class="unlisted">
							<span>In the opening, not here yet:</span>
							{#each unlisted as n (n)}
								<button type="button" class="add-person" onclick={() => sim.cast.push({ name: n, who: "" })}>
									<Plus class="size-3.5" aria-hidden="true" />{n}
								</button>
							{/each}
						</p>
					{/if}
					<div>
						<Button variant="ghost" size="sm" onclick={() => sim.cast.push({ name: "", who: "" })}><Plus aria-hidden="true" />Add someone</Button>
					</div>
				</div>
				<div class="full">
					<Accordion variant="plain" title="Others who may turn up" open={!!extra.others}>
						<textarea
							class="adm-input"
							rows="2"
							use:autogrow={extra.others}
							bind:value={extra.others}
							aria-label="Others who may turn up"
							placeholder="The kind of people who pass by here. Their names are drawn when they appear."
						></textarea>
					</Accordion>
					<Accordion variant="plain" title={extra.followed.length ? `What really followed · ${extra.followed.length}` : "What really followed"}>
						<p class="h">From the capture: what was said after the opening. The people draw on it; learners never see it.</p>
						{#if extra.followed.length}
							<ul class="followed">
								{#each extra.followed as f, i (i)}
									<li>
										<b>{f.author}</b><span>{f.text}</span
										><button type="button" class="adm-icon" aria-label="Remove" onclick={() => extra.followed.splice(i, 1)}>
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

<CaptureImport bind:open={importing} site={s.site} />

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

<ModalDialog bind:open={withdrawing} labelledby="wd-h">
	<h2 id="wd-h" class="mb-2">Withdraw this scenario?</h2>
	<p class="imp-p">Learners stop finding it on the shelf and in the library. Pieces already written from it stay theirs.</p>
	<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (withdrawing = false)} data-initial-focus>Cancel</Button>
		<Button
			variant="destructive-solid"
			onclick={() => {
				withdrawing = false;
				status = "withdrawn";
				toast("Withdrawn (demo)");
			}}
			>Withdraw</Button
		>
	</div>
</ModalDialog>

<style>
.ttl {
	min-width: 0;
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
	flex: 0 0 11rem;
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
