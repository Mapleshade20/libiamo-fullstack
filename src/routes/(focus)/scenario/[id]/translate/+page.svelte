<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import { untrack } from "svelte";
import { app } from "#lib/account/app.svelte.ts";
import { dropLocalDraft, keepLocalDraft, localDraft } from "#lib/client/drafts.ts";
import { autogrow } from "#lib/components/common/motion.ts";
import { tip } from "#lib/components/common/tip.ts";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import FocusBar from "#lib/components/shell/FocusBar.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { nameOf, tx } from "#lib/i18n/tx.ts";
import { sendSheet, sheet } from "#lib/scenario/scenario.remote.ts";
import { startPiece } from "#lib/session/start.ts";
import type { Setup } from "#lib/session/types.ts";
import { blockAt, blocksOf, isByLine, termRuns } from "#lib/translation/blocks.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * Writing a translation. Sources come from anywhere (a book, a blog, a forum post, a menu), so the page imitates none
 * of them: one sheet, laid out the way the source is (its paragraphs, or its lines), with the source beside it. The
 * paragraph the caret is in lights up in the source, so a long text needs no box per paragraph and sentences can still
 * be joined or split freely. Names and terms the scenario gives are marked in the source (their meaning on hover) and can
 * be put in with a click. What the learner cannot say yet they leave in their own language: those words become the
 * revision's stops. Nothing here helps or checks; the two passes come after, straight from "done". The draft stays on
 * this device as it is typed (lib/client/drafts.ts: a learner comes back to it on the same device); "done" sends it, and
 * only then is it a piece (with the plan typed on the scenario's page).
 */
const id = $derived(page.params.id ?? "");
const data = $derived(await sheet({ id, lang: app.lang }));
const scenario = $derived(data?.scenario);
const s = $derived(scenario?.situation.kind === "translate" ? scenario.situation : undefined);
// One line per item (a menu) or blank-line paragraphs (prose): the sheet follows the source.
const byLine = $derived(!!s && isByLine(s.source));
const units = $derived(s ? blocksOf(s.source, byLine).map((b) => s.source.slice(b.from, b.to)) : []);
const terms = $derived(s?.glossary ?? []);

let text = $state("");
const draftKey = $derived(data ? `${id}|${data.language}` : "");
// The draft on this device, once per scenario (a piece taken up again brings its text, if the device has none).
let loaded = "";
$effect(() => {
	const d = data;
	if (!d || loaded === d.scenario.id) return;
	loaded = d.scenario.id;
	untrack(() => (text = localDraft("sheet", `${id}|${d.language}`) || d.draft));
	// Already gone into its revision (another tab, another device): it goes on there.
	if (d.revising && d.pieceId) goto(`/live/${d.pieceId}`, { replace: true });
});
const blocks = $derived(blocksOf(text, byLine));
let caret = $state(0);
let focused = $state(false);
const active = $derived(Math.min(blockAt(text, caret, byLine), Math.max(units.length - 1, 0)));
const written = $derived(units.map((_, i) => !!blocks[i]));
let area: HTMLTextAreaElement | undefined = $state();
let all = $state(false);

const native = $derived(nameOf(s?.sourceLang ?? app.prefs.native));
const target = $derived(nameOf(data?.language ?? app.lang));

function track() {
	if (!area) return;
	caret = area.selectionStart;
}

/** What is typed is kept on this device at once (nothing goes to the server until "done"). */
function save() {
	if (draftKey) keepLocalDraft("sheet", draftKey, text);
}
/** A given name or term goes in where the caret is, and the caret stays after it. */
function insert(term: string) {
	if (!area) return;
	const from = area.selectionStart;
	const to = area.selectionEnd;
	const before = area.value.slice(0, from);
	const pad = before && !/\s$/.test(before) && !/^\s/.test(area.value.slice(to)) ? " " : "";
	area.setRangeText(`${pad}${term}`, from, to, "end");
	text = area.value;
	save();
	area.focus();
	track();
}

let leaving = $state(false);
async function done() {
	if (!scenario || !text.trim() || leaving) return;
	leaving = true;
	const key = draftKey;
	const sent = data
		? await sendSheet({ id, lang: data.language, text: text.trim(), plan: localDraft("plan", key), ...data.binding }).catch(() => null)
		: null;
	const pieceId = sent?.pieceId ?? null;
	// The server hands the revision what was sent, the source and the original from the piece.
	const started = pieceId
		? await startPiece({ pieceId, learner: app.prefs.native, feedback: app.prefs.feedback as Setup["feedback"] }).catch(() => null)
		: null;
	if (!started) {
		leaving = false;
		return toast(tx("startFailed"));
	}
	// It is a piece now: what this device kept for it goes.
	dropLocalDraft("sheet", key);
	dropLocalDraft("plan", key);
	goto(`/live/${started}`);
}
$effect(() => {
	document.title = `${scenario?.title ?? ""} · Libiamo`;
});
</script>

<FocusBar exit={{ label: tx("afterLater"), href: scenario ? `/scenario/${scenario.id}` : "/" }} />
{#if !scenario || !s}
	<main class="tr"><EmptyState art="clink" title={tx("qMissing")} action={{ label: tx("shelfAll"), href: "/library" }} /></main>
{:else}
	<main class="tr">
		<header>
			<h1 class="title">{scenario.title}</h1>
			<p class="brief">{scenario.introduction ?? scenario.line}</p>
		</header>

		<div class="cols">
			<aside class="src" class:all aria-labelledby="src-h">
				<div class="src-head">
					<h2 id="src-h" class="label">{tx("trSource")}</h2>
					<button type="button" class="more" aria-expanded={all} onclick={() => (all = !all)}>{tx(all ? "trSourceLess" : "trSourceAll")}</button>
				</div>
				<div class="src-text" lang={s.sourceLang === "zh-CN" ? "zh-Hans" : s.sourceLang}>
					{#each units as u, i}
						<p class="unit" class:on={focused && i === active} class:current={i === active} class:done={written[i]} class:line={byLine}>
							{#each termRuns(u, terms) as r}
								{#if r.term}
									<span class="term" use:tip={r.term.gloss}>{r.text}</span>
								{:else}
									{r.text}
								{/if}
							{/each}
						</p>
					{/each}
				</div>
				{#if terms.length}
					<div class="given">
						<h3 class="label">{tx("trGiven")}</h3>
						<div class="chips">
							{#each terms as g}
								<button
									type="button"
									class="chip"
									onmousedown={(e) => e.preventDefault()}
									onclick={() => insert(g.term)}
									use:tip={{ text: tx("trInsertTip", { gloss: g.gloss }), side: "top" }}
								>
									{#if g.shown !== g.term}
										<span class="shown">{g.shown}</span>
									{/if}
									<b lang={app.lang}>{g.term}</b>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			</aside>

			<section class="draft" aria-label={tx("trSheet", { lang: target })}>
				<textarea
					bind:this={area}
					bind:value={text}
					use:autogrow={text}
					lang={app.lang}
					rows={Math.max(units.length * (byLine ? 1 : 3), 6)}
					spellcheck="false"
					placeholder={tx("trPh", { lang: target })}
					aria-label={tx("trSheet", { lang: target })}
					oninput={() => {
						save();
						track();
					}}
					onkeyup={track}
					onclick={track}
					onselect={track}
					onfocus={() => {
						focused = true;
						track();
					}}
					onblur={() => (focused = false)}
				></textarea>
				<div class="foot">
					<p class="stuck">{tx("trStuck", { lang: native })}</p>
					<Button disabled={!text.trim() || leaving} onclick={done}>{tx("trDone")}<ArrowRight aria-hidden="true" /></Button>
				</div>
			</section>
		</div>
	</main>
{/if}

<style>
.tr {
	width: min(1180px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(8px, 3vh, 28px) 0 96px;
}
header {
	max-width: 720px;
	margin-bottom: 22px;
}
.title {
	font-size: clamp(26px, 3.4vw, 34px);
	margin: 0 0 6px;
}
.brief {
	margin: 0;
	font-size: 15px;
	color: var(--ink-2);
}
.cols {
	display: grid;
	grid-template-columns: minmax(280px, 5fr) minmax(0, 7fr);
	gap: 24px;
	align-items: start;
}
.label {
	margin: 0;
	font: 500 13px / 1.4 var(--font-sans-stack);
	color: var(--muted);
}

/* The source: a card beside the sheet, staying in view while the sheet grows. */
.src {
	position: sticky;
	top: 16px;
	max-height: calc(100dvh - 32px);
	overflow: auto;
	padding: 16px 18px 18px;
	border-radius: 6px;
	background: var(--card-bg);
	border: 1px solid var(--edge);
}
.src-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 10px;
}
.more {
	display: none;
	padding: 2px 6px;
	margin: -2px -6px;
	border-radius: 6px;
	font-size: 13px;
	color: var(--muted);
	transition:
		color 150ms,
		background-color 150ms;
}
.more:hover {
	color: var(--ink);
	background: var(--hover);
}
.src-text {
	display: grid;
	gap: 10px;
}
.unit {
	position: relative;
	margin: 0;
	padding: 2px 0 2px 12px;
	border-left: 2px solid var(--line-soft);
	font-size: 15.5px;
	line-height: 1.75;
	color: var(--ink-2);
	white-space: pre-line;
	transition:
		border-color 200ms,
		color 200ms,
		background-color 200ms;
}
.unit.line {
	line-height: 1.6;
}
/* Written: the margin inks. The one being written: the margin is the mark colour and the text full ink. */
.unit.done {
	border-left-color: color-mix(in srgb, var(--ink) 30%, transparent);
}
.unit.on {
	border-left-color: var(--wine);
	color: var(--ink);
}
.term {
	text-decoration: underline dotted color-mix(in srgb, var(--ink) 45%, transparent);
	text-underline-offset: 3px;
	cursor: help;
}
.given {
	margin-top: 16px;
	padding-top: 12px;
	border-top: 1px solid var(--line-soft);
}
.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
}
.chip {
	display: inline-flex;
	align-items: baseline;
	gap: 6px;
	padding: 3px 9px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--edge);
	font-size: 13.5px;
	color: var(--ink);
	transition:
		background-color 150ms,
		transform 100ms;
}
.chip:hover {
	background: var(--card-hover);
}
.chip:active {
	transform: scale(0.97);
}
.chip .shown {
	color: var(--muted);
}
.chip b {
	font-weight: 600;
}

/* The sheet: the same paper the session's post sits on, so "done" carries the text straight into the revision. */
.draft {
	background: var(--raised);
	border: 1px solid var(--edge);
	border-radius: 6px;
	padding: 26px 40px 18px;
	box-shadow: var(--paper-lift);
}
:global(html[data-vt$="/translate>/live"]) .draft {
	view-transition-name: card;
}
:global(html[data-vt$="/translate>/live"]) .title {
	view-transition-name: hero-title;
}
textarea {
	display: block;
	width: 100%;
	min-height: 12em;
	resize: none;
	border: 0;
	outline: 0;
	padding: 0;
	background: transparent;
	color: var(--ink);
	font: 16.5px / 1.95 var(--font-sans-stack);
}
textarea::placeholder {
	color: var(--muted);
}
.foot {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 14px;
	padding-top: 12px;
	border-top: 1px solid var(--line-soft);
}
.stuck {
	flex: 1;
	margin: 0;
	font-size: 13px;
	color: var(--muted);
}

/* A phone: the source sits on top of the sheet and shows only the paragraph being written, unless opened. */
@media (max-width: 860px) {
	.cols {
		grid-template-columns: 1fr;
		gap: 12px;
	}
	.src {
		top: 0;
		z-index: 2;
		max-height: 45dvh;
		padding: 12px 14px 14px;
		box-shadow: var(--paper-lift);
	}
	.more {
		display: inline-block;
	}
	.src:not(.all) .unit:not(.current) {
		display: none;
	}
	/* The given names stay at hand: one row that scrolls sideways, without its heading. */
	.src:not(.all) .given {
		margin-top: 10px;
		padding-top: 8px;
	}
	.src:not(.all) .given .label {
		display: none;
	}
	.src:not(.all) .chips {
		flex-wrap: nowrap;
		overflow-x: auto;
		margin: 0 -14px;
		padding: 0 14px 2px;
		scrollbar-width: none;
		/* The row fades out at the end, so it reads as one that goes on. */
		mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
	}
	.src:not(.all) .chip {
		flex: none;
	}
	.draft {
		padding: 18px 18px 14px;
	}
	.foot {
		flex-wrap: wrap;
	}
	.stuck {
		flex-basis: 100%;
	}
}
</style>
