<script lang="ts">
import "#lib/components/session/post.css";
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Flag from "@lucide/svelte/icons/flag";
import Terminal from "@lucide/svelte/icons/terminal";
import { slide } from "svelte/transition";
import { fmtClock, fmtCost, fmtDay, fmtWhen, langEn, type RecordedCall, type RecordedStep } from "#lib/admin/records.ts";
import { caseList, flagStep, sessionOne } from "#lib/admin/sessions.remote.ts";
import CallDetail from "#lib/components/admin/CallDetail.svelte";
import Signals from "#lib/components/admin/Signals.svelte";
import ModalDialog from "#lib/components/common/ModalDialog.svelte";
import { autogrow } from "#lib/components/common/motion.ts";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import { tip } from "#lib/components/common/tip.ts";
import Speaker from "#lib/components/session/Speaker.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { page } from "$app/state";

/*
 * One session as its record has it (docs/design/2026-11-11-session-records.md): on the left what the learner saw and
 * did, step by step, with how long they waited and the calls each step made; on the right every call of the session
 * by when it started, or the one opened. Any step can be flagged with a note, which makes the session a case and keeps
 * its calls past 30 days. The command copies what Claude Code runs to reproduce it locally.
 */
// Asked for together: a `$derived(await …)` is not begun until the one before it has its answer, and a query is not
// asked for until it is awaited (await_waterfall).
const [row, cases] = $derived(await Promise.all([sessionOne(page.params.id ?? ""), caseList()]));
const CALLS = $derived(row?.callRecords ?? []);
const steps = $derived(row?.steps ?? []);
const byId = $derived(new Map(CALLS.map((c) => [c.id, c])));
const longest = $derived(Math.max(1, ...CALLS.map((c) => c.ms)));
const ofStep = $derived(new Map(steps.flatMap((s) => s.calls.map((id) => [id, s.id] as const))));
let open = $state<RecordedCall | null>(null);
// What the phone's sheet shows: kept while it slides away after closing.
let last = $state<RecordedCall | null>(null);
let width = $state(1000);
const wide = $derived(width >= 900);
let tab = $state("steps");
let flagging = $state<string | null>(null);
let note = $state("");
const who = $derived({
	tutor: { name: "Tutor", color: "var(--tutor)", icon: "pen" },
	reader: { name: row?.reader ?? "Reader", color: "var(--reader-who)", icon: "reader" },
	me: { name: row?.learner ?? "Learner", color: "var(--me)", icon: "person" },
});
const KIND = { own: "Free writing", scenario: "Scenario", translation: "Translation" };
function show(c: RecordedCall) {
	open = c;
	last = c;
	document.getElementById(`step-${ofStep.get(c.id)}`)?.classList.add("lit");
	setTimeout(() => {
		for (const e of document.querySelectorAll(".step.lit")) e.classList.remove("lit");
	}, 1200);
}
async function saveFlag(s: RecordedStep) {
	if (!row) return;
	const id = await flagStep({ pieceId: row.id, stepSeq: Number(s.id), note: note.trim() }).catch(() => null);
	if (id === null) return toast("Could not flag it");
	flagging = null;
	note = "";
	toast(`Case ${id} opened`);
}
async function copyCommand() {
	if (!row) return;
	await navigator.clipboard?.writeText(`pnpm case pull ${row.id}`).catch(() => {});
	toast(`Copied: pnpm case pull ${row.id}`);
}
const caseOf = (n: number) => cases.find((c) => c.id === n);
</script>

{#snippet callList()}
	<ul class="call-list">
		{#each CALLS as c (c.id)}
			<li>
				<button type="button" class="call-row" aria-current={open?.id === c.id ? "true" : undefined} onclick={() => show(c)}>
					<span class="at">{fmtClock(c.at)}</span>
					<span class="pp">{c.purpose}</span>
					<span class="bar" aria-hidden="true"><i style:width="{Math.max(3, (c.ms / longest) * 100)}%" class:long={c.ms > 20000}></i></span>
					<span class="ms">{(c.ms / 1000).toFixed(1)} s</span>
				</button>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="adm-page" bind:clientWidth={width}>
	<a class="adm-back" href="/admin/sessions"><ArrowLeft class="size-4" aria-hidden="true" />Sessions</a>
	{#if !row}
		<p class="adm-empty adm-paper">No such session, or its learner does not help improve Libiamo.</p>
	{:else}
		<header class="adm-head">
			<div class="ttl">
				<h1>{row.title}</h1>
				<p class="facts">
					<span>{row.learner}</span><span class="adm-dot">{langEn(row.native)} → {langEn(row.lang)}</span><span class="adm-dot">{KIND[row.kind]}</span
					><span class="adm-dot">{fmtWhen(row.at)}</span><span class="adm-dot">{row.minutes} min</span
					><span class="adm-dot">{row.calls} calls · {fmtCost(row.cost)}</span>
					{#if row.sha}
						<span class="adm-dot"><span class="adm-tag mono" use:tip={"The code that ran it"}>{row.sha}</span></span>
					{/if}
				</p>
				{#if row.signals.length}
					<div class="sigs"><Signals signals={row.signals} labels /></div>
				{/if}
			</div>
			<div class="acts">
				<Button variant="secondary" onclick={copyCommand}><Terminal aria-hidden="true" />Copy pull command</Button>
			</div>
		</header>

		{#if !wide}
			<div class="tabs">
				<SegmentedControl
					label="View"
					size="sm"
					bind:value={tab}
					items={[
						{ value: "steps", label: "Steps" },
						{ value: "calls", label: `Calls ${CALLS.length}` },
					]}
				/>
			</div>
		{/if}

		<div class="cols" class:wide>
			{#if wide || tab === "steps"}
				<ol class="steps session">
					{#each steps as s (s.id)}
						<li class="step" id="step-{s.id}" class:flagged={!!s.flag}>
							<div class="rail"><span class="clock">{fmtClock(s.at)}</span></div>
							<div class="body">
								<div class="sh">
									<span class="label">{s.label}</span>
									{#if s.wait}
										<span class="adm-tag" class:warn={s.wait > 8}>waited {s.wait.toFixed(0)} s</span>
									{/if}
									<span class="grow"></span>
									{#if !s.flag}
										<button
											type="button"
											class="adm-icon flag-btn"
											aria-label="Flag this step"
											aria-expanded={flagging === s.id}
											use:tip={"Flag this step"}
											onclick={() => {
												flagging = flagging === s.id ? null : s.id;
												note = "";
											}}
										>
											<Flag class="size-4" aria-hidden="true" />
										</button>
									{/if}
								</div>
								{#each s.lines as l, i (i)}
									{#if l.who === "card"}
										<p class="card-line">{l.text}</p>
									{:else if l.who === "choices"}
										<ul class="pills" aria-label="Buttons offered">
											{#each l.text.split(" | ") as p}
												<li class="pill">{p}</li>
											{/each}
										</ul>
									{:else}
										<Speaker
											who={who[l.who]}
											icon={who[l.who].icon}
											kind={l.who === "reader" ? "reader" : l.who === "me" ? "me" : ""}
											grouped={i > 0 && s.lines[i - 1].who === l.who}
										>
											{#each l.text.split("\n\n") as p}
												<p>{p}</p>
											{/each}
										</Speaker>
									{/if}
								{/each}
								{#if s.calls.length}
									<div class="chips">
										{#each s.calls as id (id)}
											{@const c = byId.get(id)}
											{#if c}
												<button type="button" class="chip" aria-pressed={open?.id === id} onclick={() => show(c)}>
													{c.purpose}<span>{(c.ms / 1000).toFixed(1)} s</span>
												</button>
											{/if}
										{/each}
									</div>
								{/if}
								{#if flagging === s.id}
									<form
										class="flag-form"
										transition:slide={{ duration: 200 }}
										onsubmit={(e) => {
											e.preventDefault();
											saveFlag(s);
										}}
									>
										<textarea
											class="adm-input"
											rows="2"
											use:autogrow={note}
											bind:value={note}
											placeholder="What is wrong here"
											aria-label="What is wrong here"
											data-initial-focus
										></textarea>
										<div class="fa">
											<Button variant="secondary" size="sm" onclick={() => (flagging = null)}>Cancel</Button
											><Button size="sm" type="submit" disabled={!note.trim()}>Flag</Button>
										</div>
									</form>
								{/if}
								{#if s.flag}
									{@const k = caseOf(s.flag.case)}
									<div class="flag-note">
										<p>{s.flag.note}</p>
										<p class="by">
											<a href="/admin/cases">Case {s.flag.case}</a>
											· {s.flag.by}, {fmtDay(s.flag.at)}
											{#if k?.status === "fixed"}
												· <span class="adm-tag ok">Fixed in <span class="mono">{k.commit}</span></span>
											{:else if k?.status === "wontfix"}
												· Won't fix
											{/if}
										</p>
									</div>
								{/if}
								{#if s.signals?.includes("left")}
									<p class="end">The learner left here.</p>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
			{#if wide}
				<aside class="panel adm-paper" aria-label="Calls">
					{#if open}
						{#key open.id}
							<CallDetail call={open} onback={() => (open = null)} />
						{/key}
					{:else}
						<h2 class="ph">Calls <span>{CALLS.length}</span></h2>
						{@render callList()}
					{/if}
				</aside>
			{:else if tab === "calls"}
				<div class="adm-paper pad">{@render callList()}</div>
			{/if}
		</div>
	{/if}
</div>

{#if !wide}
	<ModalDialog
		bind:open={
			() => !!open,
			(v) => {
	if (!v) open = null;
}
		}
		labelledby="call-h"
		variant="sheet"
		lightDismiss
	>
		<div class="sheet-card">
			<span id="call-h" class="sr-only">Call</span>
			{#if last}
				{#key last.id}
					<CallDetail call={last} />
				{/key}
			{/if}
		</div>
	</ModalDialog>
{/if}

<style>
.ttl {
	min-width: 0;
}
.facts {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	margin: 8px 0 0;
	color: var(--muted);
	font-size: 13.5px;
}
.sigs {
	margin-top: 10px;
}
.tabs {
	margin-bottom: 14px;
}
.cols {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 28px;
}
.cols.wide {
	grid-template-columns: minmax(0, 1fr) minmax(0, 23rem);
	align-items: start;
}
.panel {
	position: sticky;
	top: 20px;
	max-height: calc(100dvh - 40px);
	overflow: auto;
	padding: 16px 18px;
	overscroll-behavior: contain;
}
.ph {
	display: flex;
	align-items: baseline;
	gap: 8px;
	margin-bottom: 8px;
	font-size: 19px;
}
.ph span {
	font-family: var(--font-sans-stack);
	font-size: 13px;
	color: var(--muted);
}
.pad {
	padding: 10px 12px;
}
/* The steps: a clock on the rail, then what the learner saw. */
.steps {
	margin: 0;
	padding: 0;
	list-style: none;
}
.step {
	display: grid;
	grid-template-columns: 3.2rem minmax(0, 1fr);
	gap: 10px;
	padding: 14px 8px 14px 0;
	border-radius: 6px;
	transition: background-color 600ms var(--ease-panel);
}
.step + .step {
	border-top: 1px solid var(--line-soft);
}
:global(.step.lit) {
	background: color-mix(in srgb, var(--accent-c) 8%, transparent);
	transition-duration: 150ms;
}
.clock {
	display: block;
	padding-top: 2px;
	color: var(--muted);
	font:
		12px / 20px ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
	text-align: right;
}
.body {
	min-width: 0;
}
.sh {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-height: 28px;
	margin-bottom: 8px;
}
.label {
	font-size: 14px;
	font-weight: 600;
}
.grow {
	flex: 1;
}
.flag-btn {
	opacity: 0;
	transition:
		opacity 150ms,
		color 150ms,
		background-color 150ms;
}
.step:hover .flag-btn,
.flag-btn:focus-visible,
.flag-btn[aria-expanded="true"] {
	opacity: 1;
}
@media (pointer: coarse) {
	.flag-btn {
		opacity: 1;
	}
}
.body :global(.cm-text p) {
	margin: 0;
}
.body :global(.cm-text p + p) {
	margin-top: 8px;
}
.card-line {
	margin: 0 0 10px;
	padding: 10px 12px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--raised);
	box-shadow: var(--paper-lift);
	color: var(--ink-2);
	font-size: 13.5px;
	white-space: pre-line;
}
.pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin: -2px 0 12px 38px;
}
.pill {
	padding: 3px 10px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--raised-face);
	box-shadow: var(--raised-shadow);
	font-size: 13px;
}
.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 4px;
}
.chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 26px;
	padding: 0 9px;
	border: 1px dashed var(--line);
	border-radius: 5px;
	background: transparent;
	color: var(--ink-2);
	font-size: 12.5px;
	cursor: pointer;
	transition:
		background-color 150ms,
		border-color 150ms,
		scale 150ms;
}
.chip span {
	color: var(--muted);
	font-variant-numeric: tabular-nums;
}
.chip:hover {
	background: var(--hover);
}
.chip:active {
	scale: 0.97;
}
.chip[aria-pressed="true"] {
	border-style: solid;
	border-color: var(--ink);
	color: var(--ink);
}
.chip:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
@media (pointer: coarse) {
	.chip {
		height: 36px;
	}
}
.flag-form {
	display: grid;
	gap: 8px;
	margin-top: 12px;
}
.fa {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
/* A flag: an index card with its red head rule. */
.flag-note {
	margin-top: 12px;
	padding: 10px 14px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	box-shadow:
		inset 0 2px 0 var(--red),
		var(--paper-lift);
	font-size: 14px;
	line-height: 1.55;
}
.flag-note p {
	margin: 0;
}
.flag-note .by {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
	margin-top: 6px;
	color: var(--muted);
	font-size: 12.5px;
}
.flag-note a {
	color: var(--ink);
}
.mono {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.end {
	margin: 4px 0 0;
	color: var(--muted);
	font-size: 13px;
	font-style: italic;
}
/* Every call by when it started; its bar is its length against the longest call. */
.call-list {
	margin: 0;
	padding: 0;
	list-style: none;
}
.call-row {
	display: grid;
	grid-template-columns: 2.6rem minmax(0, 1fr) 4.5rem 3rem;
	align-items: center;
	gap: 8px;
	width: 100%;
	min-height: 34px;
	padding: 0 6px;
	border: 0;
	border-radius: 5px;
	background: none;
	color: inherit;
	font: inherit;
	font-size: 13px;
	text-align: left;
	cursor: pointer;
	transition: background-color 150ms;
}
.call-row:hover,
.call-row[aria-current="true"] {
	background: var(--hover);
}
.call-row:focus-visible {
	outline: none;
	box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--ring-c) 80%, transparent);
}
.at,
.ms {
	color: var(--muted);
	font-size: 12px;
	font-variant-numeric: tabular-nums;
}
.ms {
	text-align: right;
}
.pp {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.bar {
	height: 6px;
	border-radius: 3px;
	background: var(--track, var(--well));
	overflow: hidden;
}
.bar i {
	display: block;
	height: 100%;
	border-radius: inherit;
	background: color-mix(in srgb, var(--ink) 55%, transparent);
}
.bar i.long {
	background: var(--warn);
}
.sheet-card {
	max-height: calc(100dvh - 1rem);
	overflow: auto;
	padding: 18px 18px calc(18px + env(safe-area-inset-bottom));
	border-radius: 8px 8px 0 0;
	background: var(--raised);
}
</style>
