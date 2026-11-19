<script lang="ts">
import { fly } from "svelte/transition";
import { app } from "#lib/account/app.svelte.ts";
import CaptureScripts from "#lib/components/common/CaptureScripts.svelte";
import { autogrow, shake } from "#lib/components/common/motion.ts";
import Notice from "#lib/components/common/Notice.svelte";
import Reveal from "#lib/components/common/Reveal.svelte";
import Select from "#lib/components/common/Select.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { SUGGESTION_PLACES, type SuggestionPlace } from "#lib/constants.ts";
import { endonym, tx } from "#lib/i18n/tx.ts";
import { mySuggestions, suggest } from "#lib/scenario/suggestion.remote.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import { dateAt } from "#lib/time/clock.svelte.ts";
import { sourceStatus } from "#lib/writing/source-status.ts";

/*
 * Suggesting a situation (the shelf's "+" card): something real the learner had to write, or saw someone write, that
 * could become a scenario. Short on purpose: where it was, what happened (pasted text, their own words, or a page
 * captured with the composer's scripts, which the admin cuts the way they cut their own captures), whom they were
 * writing to, what they wanted to do, and what they wrote, if they did. Only what happened and what they wanted are
 * asked for; the hints say what helps for the place. An admin curates it before anyone practises on it, changing names
 * and removing anything personal; the page says so. At most five wait for review at a time; one set aside says why,
 * one that became a scenario leads to it.
 */
const LIMIT = 5;
const placeName = (p: SuggestionPlace) => (p === "other" ? tx("ctElsewhere") : SITE_OF[p]);

const list = $derived(await mySuggestions());
const pending = $derived(list.filter((s) => s.status === "pending").length);
let place = $state<SuggestionPlace>("reddit");
let sending = $state(false);
let lang = $state(app.lang);
let situation = $state("");
let who = $state("");
let grab = $state(false);
const capturable = $derived(place === "ao3" || place === "reddit" || place === "discord");
let purpose = $state("");
let mine = $state("");
let sent = $state(false);
let sitEl: HTMLTextAreaElement | undefined = $state();
let purposeEl: HTMLInputElement | undefined = $state();
let errors = $state<{ situation?: boolean; purpose?: boolean }>({});
const status = $derived(sourceStatus(situation, tx));
const fmt = (at: number) => dateAt(at, { month: "short", day: "numeric" });

async function submit(e: SubmitEvent) {
	e.preventDefault();
	if (sending) return;
	errors = { situation: !situation.trim() || status.kind === "broken", purpose: !purpose.trim() };
	const first = errors.situation ? sitEl : errors.purpose ? purposeEl : null;
	if (first) {
		shake(first);
		first.focus();
		return;
	}
	sending = true;
	const r = await suggest({
		place,
		language: lang,
		situation: situation.trim(),
		who: who.trim() || undefined,
		purpose: purpose.trim(),
		mine: mine.trim() || undefined,
	}).catch(() => null);
	sending = false;
	// Refused at the limit, the page shows the limit (the list has been refreshed); a failure keeps what was typed.
	if (!r) return toast(tx("auSomethingWrong"));
	if (!r.ok) return;
	situation = who = purpose = mine = "";
	sent = true;
	scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
// Editing a field answers what was said about it.
$effect(() => {
	if (errors.situation && situation.trim() && status.kind !== "broken") errors.situation = false;
	if (errors.purpose && purpose.trim()) errors.purpose = false;
});
$effect(() => {
	document.title = `${tx("addTitle")} · ${tx("homeTitle")}`;
});
</script>

<main class="sheet">
	<h1>{tx("addTitle")}</h1>
	{#if sent}
		<div in:fly={{ y: 8, duration: 300 }}>
			<EmptyState art="clink" title={tx("ctThanksTitle")} body={tx("ctThanks")} action={{ label: tx("ctAnother"), onclick: () => (sent = false) }} />
		</div>
	{:else if pending >= LIMIT}
		<Notice tone="info" title={tx("ctLimitTitle")} role="status"><p class="m-0">{tx("ctLimit", { n: LIMIT })}</p></Notice>
	{:else}
		<p class="lede">{tx("ctLede")}</p>
		<form class="card" novalidate onsubmit={submit}>
			<div class="two">
				<div class="field">
					<span class="name">{tx("ctPlace")}</span>
					<Select aria-label={tx("ctPlace")} bind:value={place} items={SUGGESTION_PLACES.map((p) => ({ value: p, label: placeName(p) }))} />
				</div>
				<div class="field">
					<span class="name">{tx("ctLang")}</span>
					<Select aria-label={tx("ctLang")} bind:value={lang} items={app.prefs.learning.map((l) => ({ value: l, label: endonym(l) }))} />
				</div>
			</div>
			<div class="field">
				<div class="name-row">
					<label class="name" for="ct-sit">{tx("ctSituation")}</label>
					{#if capturable}
						<button type="button" class="text-link" aria-expanded={grab} aria-controls="ct-grab" onclick={() => (grab = !grab)}>
							{tx("grabLink")}
						</button>
					{/if}
				</div>
				<span class="help" id="ct-sit-help">{tx(`ctSit_${place}`)}</span>
				<Reveal open={grab && capturable}><CaptureScripts id="ct-grab" /></Reveal>
				<textarea
					id="ct-sit"
					bind:this={sitEl}
					bind:value={situation}
					rows="5"
					{lang}
					spellcheck="false"
					aria-invalid={errors.situation || undefined}
					aria-describedby="ct-sit-help ct-sit-err"
					use:autogrow={situation}
				></textarea>
				{#if errors.situation}
					<span class="err" id="ct-sit-err" data-field-error="situation">{status.kind === "broken" ? status.line : tx("ctNeedSituation")}</span>
				{:else if status.line}
					<span class="status" aria-live="polite">{status.line}</span>
				{/if}
			</div>
			<label class="field">
				<span class="name">{tx("ctWho")}</span>
				<input bind:value={who} class="input" placeholder={tx("ctWhoPh")} maxlength="160" {lang}>
			</label>
			<label class="field">
				<span class="name">{tx("ctPurpose")}</span>
				<input
					bind:this={purposeEl}
					bind:value={purpose}
					class="input"
					placeholder={tx("ctPurposePh")}
					maxlength="160"
					aria-invalid={errors.purpose || undefined}
					aria-describedby="ct-purpose-err"
				>
				{#if errors.purpose}
					<span class="err" id="ct-purpose-err" data-field-error="purpose">{tx("ctNeedPurpose")}</span>
				{/if}
			</label>
			<label class="field">
				<span class="name">{tx("ctMine")}</span>
				<textarea bind:value={mine} rows="2" {lang} use:autogrow={mine}></textarea>
			</label>
			<p class="privacy">{tx("ctPrivacy")}</p>
			<div class="actions">
				<Button variant="secondary" href="/">{tx("setCancel")}</Button>
				<Button type="submit" disabled={sending}>{tx("ctSend")}</Button>
			</div>
		</form>
	{/if}

	{#if list.length}
		<section aria-labelledby="ct-mine-h">
			<h2 id="ct-mine-h">{tx("ctYours")}</h2>
			<div class="rows">
				{#each list as s (s.id)}
					<div class="row">
						<div class="main">
							{#if s.scenarioId}
								<a class="title" href="/scenario/{s.scenarioId}">{s.purpose}</a>
							{:else}
								<div class="title">{s.purpose}</div>
							{/if}
							<p class="sub">{placeName(s.place)} · {endonym(s.language)} · {fmt(s.at)}</p>
							{#if s.status === "unused" && s.reason}
								<p class="sub why">{s.reason}</p>
							{/if}
						</div>
						<span class="tag" class:on={s.status === "live"}>{tx(`ct_${s.status}`)}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</main>

<style>
.card {
	display: grid;
	gap: 18px;
	padding: 20px 20px 18px;
	margin-bottom: 36px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	box-shadow: var(--paper-lift);
}
.two {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 14px;
}
.field {
	display: grid;
	gap: 6px;
	min-width: 0;
}
.name {
	font-size: 14px;
	font-weight: 500;
}
.name-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}
.help,
.status,
.privacy {
	color: var(--muted);
	font-size: 13px;
	line-height: 1.5;
}
.privacy {
	margin: 0;
}
.err {
	color: var(--bad);
	font-size: 13px;
}
textarea,
.input {
	width: 100%;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--field);
	color: var(--ink);
	font: 15px / 1.55 var(--font-sans-stack);
	transition:
		border-color 150ms,
		box-shadow 150ms;
}
textarea {
	padding: 9px 12px;
	resize: none;
	min-height: 64px;
}
.input {
	height: 40px;
	padding: 0 12px;
}
textarea:focus,
.input:focus {
	outline: 0;
	border-color: color-mix(in srgb, var(--ink) 40%, transparent);
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 50%, transparent);
}
[aria-invalid="true"] {
	border-color: var(--bad);
}
.actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
section h2 {
	margin-bottom: 10px;
}
@media (max-width: 640px) {
	.two {
		grid-template-columns: 1fr;
	}
	.card {
		padding: 16px 14px;
	}
}
@media (pointer: coarse) {
	textarea,
	.input {
		font-size: 16px;
	}
}
</style>
