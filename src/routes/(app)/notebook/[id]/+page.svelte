<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Pencil from "@lucide/svelte/icons/pencil";
import Plus from "@lucide/svelte/icons/plus";
import Trash2 from "@lucide/svelte/icons/trash-2";
import X from "@lucide/svelte/icons/x";
import { app } from "#lib/account/app.svelte.ts";
import { revalidate } from "#lib/client/refresh.ts";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import Select from "#lib/components/common/Select.svelte";
import { tip } from "#lib/components/common/tip.ts";
import MarkWords from "#lib/components/review/MarkWords.svelte";
import ReviewFace from "#lib/components/review/ReviewFace.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import { editTourNote, sandboxed } from "#lib/components/tour/sandbox.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { REGISTERS, type Register } from "#lib/constants.ts";
import { tx } from "#lib/i18n/tx.ts";
import { changeNote, due, noteById, notebook, removeNotes } from "#lib/notebook/notebook.remote.ts";
import { lang, noteNow } from "#lib/notebook/notebook.svelte.ts";
import { around, fixedPart, noteFaces } from "#lib/review/faces.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * One notebook entry. Its look says what each part is, so it needs no headings: the phrase (the page's one serif
 * title), what it means and how it is used right under it, sentences using it (serif, the phrase marked, their
 * translation beneath), then where it came from (what the learner first wrote, struck, and what they settled on,
 * with the place as one quiet line), then the card review asks with when. Correcting or deleting it happens here
 * (the main app's /review/manage, folded in); a deleted entry leaves review too. Editing turns the entry's own words
 * into fields in place (where it came from is a record and stays); the card below is the one review asks next as it
 * would be once saved, and each example shows the words its own card will blank.
 */
revalidate(noteNow(page.params.id ?? ""));
const n = $derived(await noteNow(page.params.id ?? ""));
const REG: Record<string, string> = {
	neutral: "regNeutral",
	casual: "regCasual",
	formal: "regFormal",
	slang: "regSlang",
	literary: "regLiterary",
	technical: "regTechnical",
};
const when = $derived(n ? (n.due ? tx("noteDueNow") : n.next === 1 ? tx("noteDueTomorrow") : tx("noteDueIn", { n: n.next ?? 1 })) : "");
const key = (phrase: string) => fixedPart(phrase);
const read = $derived(n?.sentence ? around(n.sentence, n.marked ?? n.phrase) : null);
const settled = $derived(n?.final ? around(n.final, n.marked || key(n.phrase)) : null);

let deleting = $state(false);
type Draft = { phrase: string; gloss: string; usage: string; register: string; examples: { t: string; n?: string; span?: string }[] };
let draft = $state<Draft | null>(null);
function startEdit() {
	if (n) draft = { phrase: n.phrase, gloss: n.gloss, usage: n.usage ?? "", register: n.register ?? "", examples: $state.snapshot(n.examples) ?? [] };
}
// The card review asks next, as it would be with what is being written (the same face of the entry).
const card = $derived.by(() => {
	if (!n || !draft) return n?.card;
	const was = noteFaces({ ...n, kind: n.from });
	const now = noteFaces({ ...n, ...draft, kind: n.from });
	return now[
		Math.max(
			0,
			was.findIndex((f) => f.text === n.card?.text),
		) % now.length
	];
});
const REGS = [{ value: "", label: "—" }, ...REGISTERS.map((r) => ({ value: r, label: tx(REG[r]) }))];
let busy = $state(false);
async function save(e: SubmitEvent) {
	e.preventDefault();
	if (!n || !draft?.phrase.trim() || busy) return;
	const d = $state.snapshot(draft);
	const edit = { ...d, register: (d.register || null) as Register | null, examples: d.examples.filter((x) => x.t.trim()) };
	busy = true;
	try {
		if (sandboxed()) editTourNote(n.id, { ...edit, register: edit.register ?? undefined });
		else await changeNote({ id: n.id, ...edit }).updates(noteById(n.id), notebook({ lang: lang(), from: "all" }));
		draft = null;
		toast(tx("noteSaved"));
	} catch {
		toast(tx("error"));
	} finally {
		busy = false;
	}
}
async function remove() {
	if (!n || busy) return;
	busy = true;
	try {
		if (sandboxed()) editTourNote(n.id, { deleted: true });
		else await removeNotes([n.id]).updates(notebook({ lang: lang(), from: "all" }), due(lang()));
		deleting = false;
		toast(tx("noteDeleted"));
		goto("/notebook");
	} catch {
		toast(tx("error"));
	} finally {
		busy = false;
	}
}
$effect(() => {
	document.title = `${n?.phrase ?? tx("navNotebook")} · ${tx("homeTitle")}`;
});
</script>

<main class="sheet">
	<a class="back" href="/notebook"><ArrowLeft class="size-4" aria-hidden="true" />{tx("navNotebook")}</a>
	{#if !n}
		<EmptyState art="cards" title={tx("noteMissing")} action={{ label: tx("navNotebook"), href: "/notebook" }} />
	{:else}
		{#if draft}
			<form class="edit" onsubmit={save}>
				<label class="field"
					><span>{tx("notePhrase")}</span>
					<input class="input" bind:value={draft.phrase} lang={app.lang} maxlength="120" autocomplete="off" data-initial-focus></label
				>
				<label class="field"
					><span>{tx("noteMeaning")}</span><textarea class="input area" bind:value={draft.gloss} rows="2" maxlength="400"></textarea></label
				>
				<label class="field"
					><span>{tx("noteUsage")}</span><textarea class="input area" bind:value={draft.usage} rows="3" maxlength="600"></textarea></label
				>
				<div class="field">
					<span>{tx("noteRegister")}</span>
					<div class="w-44">
						<Select aria-label={tx("noteRegister")} bind:value={draft.register} items={REGS} />
					</div>
				</div>
				<fieldset class="field">
					<legend>{tx("noteExamples")}</legend>
					<p class="hint">{tx("noteMarkHint")}</p>
					{#each draft.examples as e, i (i)}
						<div class="ex">
							<textarea class="input area" bind:value={e.t} rows="2" maxlength="400" lang={app.lang} aria-label={tx("noteExamples")}></textarea>
							<input class="input" bind:value={e.n} maxlength="400" placeholder={tx("noteTranslation")} aria-label={tx("noteTranslation")}>
							{#if e.t.trim()}
								<MarkWords text={e.t} bind:span={e.span} lang={app.lang} />
							{/if}
							<button
								type="button"
								class="drop"
								aria-label={tx("noteExampleRemove")}
								use:tip={tx("noteExampleRemove")}
								onclick={() => draft?.examples.splice(i, 1)}
							>
								<X class="size-4" aria-hidden="true" />
							</button>
						</div>
					{/each}
					<div>
						<Button variant="ghost" size="sm" onclick={() => draft?.examples.push({ t: "" })}
							><Plus aria-hidden="true" />{tx("noteExampleAdd")}</Button
						>
					</div>
				</fieldset>
				<div class="row">
					<Button variant="secondary" onclick={() => (draft = null)}>{tx("setCancel")}</Button>
					<Button type="submit" disabled={busy || !draft.phrase.trim()}>{tx("setSave")}</Button>
				</div>
			</form>
		{:else}
			<header>
				<h1 lang={app.lang}>{n.phrase}</h1>
				{#if n.gloss || n.register}
					<p class="meaning">
						{n.gloss}
						{#if n.register && REG[n.register]}
							<span class="tag">{tx(REG[n.register])}</span>
						{/if}
					</p>
				{/if}
				{#if n.usage}
					<p class="usage">{n.usage}</p>
				{/if}
			</header>

			{#if n.examples?.length}
				<ul class="examples" aria-label={tx("noteExamples")}>
					{#each n.examples as e}
						{@const m = around(e.t, e.span || key(n.phrase))}
						<li>
							<p class="t" lang={app.lang}>
								{#if m}
									{m.before}<mark>{m.part}</mark>{m.after}
								{:else}
									{e.t}
								{/if}
							</p>
							{#if e.n}
								<p class="n">{e.n}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/if}

		<section class="origin" aria-label={tx("noteFrom")}>
			{#if n.from === "own" && (n.before || n.final)}
				<div class="well">
					{#if n.before}
						<p class="was" lang={app.lang}><span class="sr-only">{tx("noteWas")}: </span><s>{n.before}</s></p>
					{/if}
					{#if n.final}
						<p lang={app.lang}>
							<span class="sr-only">{tx("noteNow")}: </span>
							{#if settled}
								{settled.before}<mark>{settled.part}</mark>{settled.after}
							{:else}
								{n.final}
							{/if}
						</p>
					{/if}
				</div>
			{:else if read}
				<div class="well">
					<p lang={app.lang}><span class="sr-only">{tx("noteRead")}: </span>{read.before}<mark>{read.part}</mark>{read.after}</p>
				</div>
			{/if}
			<p class="where">
				{#if n.whereHref}
					{tx(n.from === "own" ? "nbFromOwn" : "nbFromRead", { where: "" })}<a href={n.whereHref}>{n.where}</a>
				{:else}
					{tx(n.from === "own" ? "nbFromOwn" : "nbFromRead", { where: n.where || tx("nbSomethingRead") })}
				{/if}
			</p>
		</section>

		<section class="review" aria-label={tx("noteCard")}>
			<!-- The same front review shows (lib/review/faces.ts): what review asks next. -->
			{#if card}
				<div class="card-preview"><ReviewFace face={card} lang={app.lang} /></div>
			{/if}
			<div class="when">
				<span class="tag" class:on={n.due}>{when}</span>
				{#if n.due && n.card}
					<Button variant="secondary" size="sm" href="/review">{tx("reviewGo")}</Button>
				{/if}
			</div>
		</section>

		<div class="actions" hidden={!!draft}>
			<Button variant="secondary" onclick={startEdit}><Pencil aria-hidden="true" />{tx("noteEdit")}</Button>
			<Button variant="destructive" onclick={() => (deleting = true)}><Trash2 aria-hidden="true" />{tx("noteDelete")}</Button>
		</div>
	{/if}
</main>

<ModalDialog bind:open={deleting} labelledby="delete-h">
	<h2 id="delete-h" class="mb-3">{tx("noteDeleteTitle", { x: n?.phrase ?? "" })}</h2>
	<p class="text-sm text-muted-foreground">{tx("noteDeleteBody")}</p>
	<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (deleting = false)} data-initial-focus>{tx("setCancel")}</Button>
		<Button variant="destructive-solid" disabled={busy} onclick={remove}>{tx("noteDelete")}</Button>
	</div>
</ModalDialog>

<style>
.back {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-bottom: 18px;
	color: var(--muted);
	font-size: 14px;
	text-decoration: none;
	transition: color 150ms;
}
.back:hover {
	color: var(--ink);
}
header {
	margin-bottom: 24px;
}
header h1 {
	margin-bottom: 8px;
}
.meaning {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	margin: 0;
	color: var(--ink);
	font-size: 17px;
	line-height: 1.55;
}
.usage {
	margin: 8px 0 0;
	color: var(--muted);
	font-size: 15px;
	line-height: 1.65;
	max-width: 62ch;
}
.examples {
	margin: 0 0 28px;
	padding: 0;
	list-style: none;
	display: grid;
	gap: 14px;
}
.examples li {
	padding-left: 14px;
	border-left: 2px solid var(--line-soft);
}
.examples .t {
	margin: 0;
	font-family: var(--font-serif-stack);
	font-size: 17px;
	line-height: 1.55;
}
.examples .n {
	margin: 2px 0 0;
	color: var(--muted);
	font-size: 14px;
	line-height: 1.5;
}
.origin {
	margin-bottom: 28px;
}
.well {
	padding: 12px 16px;
	border-radius: 6px;
	background: var(--well);
}
.well p {
	margin: 0;
	font-family: var(--font-serif-stack);
	font-size: 17px;
	line-height: 1.6;
}
.well .was {
	margin-bottom: 6px;
	color: var(--muted);
}
.well s {
	text-decoration-color: color-mix(in srgb, var(--bad) 60%, transparent);
}
.where {
	margin: 8px 0 0;
	color: var(--muted);
	font-size: 13px;
}
.where a {
	color: var(--ink-2);
	text-decoration: underline;
	text-decoration-color: var(--line);
	text-underline-offset: 3px;
}
/* The phrase is marked as review marks the answer, so a phrase looks the same wherever it is asked or shown. */
mark {
	background: color-mix(in srgb, #f2c94c 45%, transparent);
	color: inherit;
	border-radius: 3px;
	padding: 0 2px;
	box-decoration-break: clone;
}
:global([data-theme="dark"]) mark {
	background: color-mix(in srgb, #c9a227 38%, transparent);
}
/* Editing in place: the entry's own words as fields, one under another. */
.edit {
	display: grid;
	gap: 16px;
	margin-bottom: 28px;
}
.field {
	display: grid;
	gap: 6px;
	margin: 0;
	padding: 0;
	border: 0;
	font-size: 14px;
	font-weight: 500;
}
.field .hint {
	margin: -4px 0 2px;
	color: var(--muted);
	font-weight: 400;
}
.ex {
	position: relative;
	display: grid;
	gap: 6px;
	padding: 10px 40px 10px 14px;
	border-left: 2px solid var(--line-soft);
}
.ex .drop {
	position: absolute;
	top: 10px;
	right: 4px;
	padding: 6px;
	border-radius: 6px;
	color: var(--muted);
}
.ex .drop:hover {
	color: var(--ink);
	background: var(--hover);
}
.edit .row {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
.review {
	margin-bottom: 28px;
}
.card-preview {
	padding: 18px 20px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--raised);
	box-shadow: var(--paper-lift);
}
.when {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-top: 12px;
}
.actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding-top: 20px;
	border-top: 1px solid var(--line-soft);
}
.input {
	width: 100%;
	height: 40px;
	padding: 0 12px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--field);
	color: var(--ink);
	font-size: 15px;
}
.input.area {
	height: auto;
	padding: 8px 12px;
	resize: vertical;
	line-height: 1.5;
}
.input:focus {
	outline: 0;
	border-color: color-mix(in srgb, var(--ink) 40%, transparent);
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 50%, transparent);
}
</style>
