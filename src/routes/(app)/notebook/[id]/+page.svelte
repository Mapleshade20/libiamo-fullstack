<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Pencil from "@lucide/svelte/icons/pencil";
import Trash2 from "@lucide/svelte/icons/trash-2";
import { app } from "#lib/account/app.svelte.ts";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import ReviewFace from "#lib/components/review/ReviewFace.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import { editTourNote, sandboxed } from "#lib/components/tour/sandbox.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { tx } from "#lib/i18n/tx.ts";
import { changeNote, due, noteById, notebook, removeNotes } from "#lib/notebook/notebook.remote.ts";
import { lang, noteNow } from "#lib/notebook/notebook.svelte.ts";
import { around, fixedPart } from "#lib/review/faces.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * One notebook entry. Its look says what each part is, so it needs no headings: the phrase (the page's one serif
 * title), what it means and how it is used right under it, sentences using it (serif, the phrase marked, their
 * translation beneath), then where it came from (what the learner first wrote, struck, and what they settled on,
 * with the place as one quiet line), then the card review asks with when. Correcting or deleting it happens here
 * (the main app's /review/manage, folded in); a deleted entry leaves review too.
 */
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
const settled = $derived(n?.final ? around(n.final, key(n.phrase)) : null);

let editing = $state(false);
let deleting = $state(false);
let phrase = $state("");
let gloss = $state("");
function startEdit() {
	phrase = n?.phrase ?? "";
	gloss = n?.gloss ?? "";
	editing = true;
}
let busy = $state(false);
async function save(e: SubmitEvent) {
	e.preventDefault();
	if (!n || !phrase.trim() || busy) return;
	const edit = { phrase: phrase.trim(), gloss: gloss.trim() };
	busy = true;
	try {
		if (sandboxed()) editTourNote(n.id, edit);
		else await changeNote({ id: n.id, ...edit }).updates(noteById(n.id), notebook(lang()));
		editing = false;
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
		else await removeNotes([n.id]).updates(notebook(lang()), due(lang()));
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
					{@const m = around(e.t, key(n.phrase))}
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
			{#if n.card}
				<div class="card-preview"><ReviewFace face={n.card} lang={app.lang} /></div>
			{/if}
			<div class="when">
				<span class="tag" class:on={n.due}>{when}</span>
				{#if n.due && n.card}
					<Button variant="secondary" size="sm" href="/review">{tx("reviewGo")}</Button>
				{/if}
			</div>
		</section>

		<div class="actions">
			<Button variant="secondary" onclick={startEdit}><Pencil aria-hidden="true" />{tx("noteEdit")}</Button>
			<Button variant="destructive" onclick={() => (deleting = true)}><Trash2 aria-hidden="true" />{tx("noteDelete")}</Button>
		</div>
	{/if}
</main>

<ModalDialog bind:open={editing} labelledby="edit-h">
	<form onsubmit={save}>
		<h2 id="edit-h" class="mb-6">{tx("noteEditTitle")}</h2>
		<label for="note-phrase" class="mb-1.5 block text-sm font-medium">{tx("notePhrase")}</label>
		<input id="note-phrase" class="input" bind:value={phrase} lang={app.lang} maxlength="120" autocomplete="off" data-initial-focus>
		<label for="note-gloss" class="mt-4 mb-1.5 block text-sm font-medium">{tx("noteMeaning")}</label>
		<textarea id="note-gloss" class="input area" bind:value={gloss} rows="3" maxlength="400"></textarea>
		<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<Button variant="secondary" onclick={() => (editing = false)}>{tx("setCancel")}</Button>
			<Button type="submit" disabled={busy || !phrase.trim() || (phrase.trim() === n?.phrase && gloss.trim() === n?.gloss)}>{tx("setSave")}</Button>
		</div>
	</form>
</ModalDialog>

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
