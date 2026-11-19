<script lang="ts">
import X from "@lucide/svelte/icons/x";
import { onDestroy, onMount, tick } from "svelte";
import { fly, slide } from "svelte/transition";
import { app } from "#lib/account/app.svelte.ts";
import { refreshQuery } from "#lib/client/refresh.ts";
import LimitNotice from "#lib/components/common/LimitNotice.svelte";
import { reducedMotion } from "#lib/components/common/motion.ts";
import FocusBar from "#lib/components/shell/FocusBar.svelte";
import { toast } from "#lib/components/shell/toast.svelte.ts";
import { captureTourState } from "#lib/components/tour/lifetime.ts";
import { keepCollected, sandboxed, tourReading } from "#lib/components/tour/sandbox.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { isAppLang } from "#lib/constants.ts";
import { loadLang, t } from "#lib/i18n/index.svelte.ts";
import { htmlLang } from "#lib/i18n/langs.ts";
import { answered, needKey, stopOf } from "#lib/llm/stops.ts";
import { readingById, removeNotes } from "#lib/notebook/notebook.remote.ts";
import { goto } from "$app/navigation";
import { page } from "$app/state";

/*
 * The stealing notebook (偷词本): what the learner pasted from their reading, to highlight what they want to own. A
 * focused page like the session's: the home page's box grows into the passage, the heading changes words. The page
 * itself speaks the passage's language (the one the door found, as the home page around it does); what the tutor says
 * about a phrase, and asking it more, speak the tutor's. Every phrase is kept the moment it is filled in. The passage
 * was kept as a reading when it was sent from the home page (the tour's, in its sandbox), so the page opens again.
 */
const currentChapter = captureTourState();
let disposed = false;
const active = () => !disposed && currentChapter();
// What is kept from the reading changes on this page (collecting is an endpoint): an answer the browser still holds
// from an earlier visit is asked again before the page marks what was kept.
const asked = sandboxed() ? null : readingById(page.params.id ?? "");
if (asked?.ready) await refreshQuery(asked);
const mine = asked ? await asked : null;
const found = asked ? mine : tourReading(page.params.id ?? "");
const SETUP = found ? { passage: found.passage, lang: found.lang, native: app.prefs.native, feedback: app.prefs.feedback } : null;
onMount(() => {
	if (!SETUP) goto("/", { replace: true });
});
const TUTOR = SETUP?.feedback === "target" ? SETUP.lang : (SETUP?.native ?? "en");
const LANG = isAppLang(TUTOR) ? TUTOR : "en";
const UI = SETUP && isAppLang(SETUP.lang) ? SETUP.lang : "en";
loadLang(LANG);
loadLang(UI);
/** The tutor's words (a phrase's notes and asking about it). */
const tx = (key: string, vars?: Record<string, string | number>) => t(LANG, key, vars);
/** The page's own words. */
const ui = (key: string, vars?: Record<string, string | number>) => t(UI, key, vars);
let touch = $state(false);
onMount(() => {
	touch = matchMedia("(pointer: coarse)").matches;
});
const REG: Record<string, string> = {
	neutral: "regNeutral",
	casual: "regCasual",
	formal: "regFormal",
	slang: "regSlang",
	literary: "regLiterary",
	technical: "regTechnical",
};

/* The passage as words: every word can be marked; the spaces and punctuation between two marked words are marked too. */
const passage = SETUP?.passage ?? "";
const segs = [...new Intl.Segmenter(SETUP?.lang ?? "en", { granularity: "word" }).segment(passage)];
const SENTENCES = [...new Intl.Segmenter(SETUP?.lang ?? "en", { granularity: "sentence" }).segment(passage)];
type Item = { phrase: string; meaning: string; why: string; register: string; example: string };
/** `id`: the notebook entry its phrase is kept as. `earlier`: kept before this visit. */
type Mark = {
	n: number;
	a: number;
	b: number;
	data: Item | null;
	id?: string;
	earlier?: boolean;
	busy: boolean;
	failed: boolean;
	thread: { q: string; a: string | null }[];
};
let nextN = 1;
/** The word that holds a character of the passage. */
const segAt = (c: number) => segs.findIndex((s) => c >= s.index && c < s.index + s.segment.length);
/**
 * What was kept from this reading before, marked again where it was: its words in its sentence (the passage is kept as
 * it was, so both are found as they were sent). One that cannot be found, or overlaps one already marked, stays in the
 * notebook unmarked.
 */
function markedBefore(): Mark[] {
	const out: Mark[] = [];
	for (const k of mine?.kept ?? []) {
		const from = k.sentence ? passage.indexOf(k.sentence) : 0;
		if (from < 0) continue;
		const at = passage.indexOf(k.marked, from);
		if (at < 0 || (k.sentence && at + k.marked.length > from + k.sentence.length)) continue;
		const [a, b] = [segAt(at), segAt(at + k.marked.length - 1)];
		if (a < 0 || b < 0 || out.some((m) => m.b >= a && m.a <= b)) continue;
		const data = { phrase: k.phrase, meaning: k.meaning, why: k.why, register: k.register, example: k.example };
		out.push({ n: nextN++, a, b, data, id: k.id, earlier: true, busy: false, failed: false, thread: [] });
	}
	return out;
}
let marks = $state<Mark[]>(markedBefore());
let openN = $state<number | null>(null);
let preview = $state<[number, number] | null>(null);
const sorted = $derived([...marks].sort((x, y) => x.a - y.a));
const textOf = (m: Mark) => passage.slice(segs[m.a].index, segs[m.b].index + segs[m.b].segment.length);
const markAt = (i: number) => marks.find((m) => i >= m.a && i <= m.b);
const isWord = (i: number) => !!segs[i]?.isWordLike;
const prevWord = (i: number) => {
	for (let k = i - 1; k >= 0; k--) if (isWord(k)) return k;
	return -1;
};
const nextWord = (i: number) => {
	for (let k = i + 1; k < segs.length; k++) if (isWord(k)) return k;
	return -1;
};

/* Kept as soon as filled in: the server files every phrase in the notebook as it fills it in, with the sentence it was
   read in, which review later asks it back in; the passage is kept once, as the reading they come from. A mark undone
   or changed takes its entry away. The tour's sandbox keeps its own. */
const batch = `${Date.now()}`;
const readingId = sandboxed() ? undefined : found?.id;
const forget = (ids: (string | undefined)[]) => {
	if (!active()) return;
	// An entry a mark still holds stays: collecting the same words again answers with the entry already kept.
	const gone = ids.filter((x): x is string => !!x && !marks.some((m) => m.id === x));
	if (gone.length && !sandboxed()) removeNotes(gone).catch(() => {});
};
function sentenceOf(m: Mark) {
	const at = segs[m.a].index;
	return (SENTENCES.find((x) => at >= x.index && at < x.index + x.segment.length)?.segment ?? "").trim();
}
/** The tour's phrases go to its sandbox (the server kept the learner's as they were filled in). */
function store() {
	if (!active() || !sandboxed() || !SETUP) return;
	keepCollected(
		batch,
		marks
			.filter((m) => m.data)
			.map((m) => {
				const d = m.data as Item;
				return {
					lang: SETUP.lang,
					phrase: d.phrase,
					meaning: d.meaning,
					why: d.why,
					register: d.register,
					example: d.example,
					marked: textOf(m),
					sentence: sentenceOf(m),
				};
			}),
	);
}

/* Filling in: every change waits a moment, then all marks not filled in yet go in one call. Asking again after a
   failure asks for a fresh reply, not the cached one that failed. */
let fillTimer: ReturnType<typeof setTimeout> | undefined;
onDestroy(() => {
	disposed = true;
	clearTimeout(fillTimer);
});
let retries = 0;
const queueFill = () => {
	clearTimeout(fillTimer);
	fillTimer = setTimeout(fill, 900);
};
async function fill() {
	if (!active()) return;
	const todo = marks.filter((m) => !m.data && !m.busy);
	if (!todo.length) return;
	for (const m of todo) {
		m.busy = true;
		m.failed = false;
	}
	const sent = todo.map((m) => ({ n: m.n, text: textOf(m), a: m.a, b: m.b, sentence: sentenceOf(m) }));
	try {
		needKey();
		stopped = null;
		const r = await fetch("/api/collect/explain", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...SETUP, readingId, highlights: sent, retry: retries }),
		});
		const got = await answered<{ items: (Item & { n: number; id?: string })[] }>(r);
		if (!active()) return;
		const stale: (string | undefined)[] = [];
		for (const s of sent) {
			const it = got.items?.find((x) => x.n === s.n);
			const m = marks.find((x) => x.n === s.n);
			// A mark changed or undone while its call was out is filled by the next call, not by this one.
			if (!m || m.a !== s.a || m.b !== s.b) {
				stale.push(it?.id);
				continue;
			}
			m.busy = false;
			m.data = it ?? null;
			m.id = it?.id;
			if (!m.data) m.failed = true;
		}
		forget(stale);
	} catch (e) {
		if (!active()) return;
		// No key, or a refused one, is said once, above the kept phrases; a failed call is said on each phrase it left empty.
		const k = stopOf(e);
		if (k !== "error") stopped = k;
		for (const m of todo) {
			m.busy = false;
			m.failed = true;
		}
	}
	for (const m of marks) if (!m.data && !m.failed) m.busy = false;
	store();
	if (marks.some((m) => !m.data && !m.failed && !m.busy)) queueFill();
}
let stopped = $state<"nokey" | "refused" | null>(null);
function retry() {
	retries++;
	for (const m of marks) m.failed = false;
	fill();
}

/* Marking: drag across words with a mouse; on a touch screen, tap a word, then the next one to stretch the mark. A mark
   that overlaps or touches another joins it. A tap on a mark opens its card. */
function addRange(a: number, b: number) {
	[a, b] = [Math.min(a, b), Math.max(a, b)];
	const before = prevWord(a);
	const after = nextWord(b) < 0 ? Number.POSITIVE_INFINITY : nextWord(b);
	const touching = marks.filter((m) => m.b >= before && m.a <= after);
	for (const m of touching) {
		a = Math.min(a, m.a);
		b = Math.max(b, m.b);
	}
	const keep = touching[0];
	const replaced = touching.map((m) => m.id);
	marks = marks.filter((m) => !touching.includes(m) || m === keep);
	if (keep) Object.assign(keep, { a, b, data: null, id: undefined, earlier: false, busy: false, failed: false });
	else marks.push({ n: nextN++, a, b, data: null, busy: false, failed: false, thread: [] });
	forget(replaced);
	openN = keep?.n ?? nextN - 1;
	queueFill();
}
let drag: { from: number; to: number; x: number; y: number; moved: boolean; touch: boolean } | null = null;
const wordIndex = (el: Element | null) => (el instanceof HTMLElement && el.classList.contains("w") ? Number(el.dataset.i) : null);
function down(e: PointerEvent) {
	const i = wordIndex(e.target as Element);
	if (i === null || e.button > 0) return;
	drag = { from: i, to: i, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType !== "mouse" };
	if (!drag.touch) e.preventDefault();
}
function move(e: PointerEvent) {
	if (!drag || drag.touch) return;
	const i = wordIndex(document.elementFromPoint(e.clientX, e.clientY));
	if (i === null || i === drag.to) return;
	drag.to = i;
	drag.moved = true;
	preview = [Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)];
}
async function up(e: PointerEvent) {
	if (!drag) return;
	const d = drag;
	drag = null;
	preview = null;
	// A touch that slid was a scroll, not a tap.
	if (d.touch && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
	if (!d.moved) {
		const m = markAt(d.from);
		if (m) {
			openN = m.n;
			await tick();
			document.querySelector(`[data-item="${m.n}"]`)?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
			return;
		}
	}
	addRange(d.from, d.to);
}
function drop(m: Mark) {
	marks = marks.filter((x) => x.n !== m.n);
	forget([m.id]);
	store();
	toast(ui("colRemoved", { phrase: m.data?.phrase ?? textOf(m) }));
}
async function askAbout(m: Mark, q: string) {
	if (!active()) return;
	if (!m.data) return;
	m.thread.push({ q, a: null });
	const turn = m.thread[m.thread.length - 1];
	openN = m.n;
	try {
		needKey();
		const r = await fetch("/api/collect/ask", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...SETUP, phrase: m.data.phrase, history: m.thread.filter((x) => x.a !== null), question: q }),
		}).then((x) => answered<{ answer?: string }>(x));
		if (!active()) return;
		turn.a = r.answer ?? tx("colFailed");
	} catch (e) {
		const k = stopOf(e);
		if (k !== "error") stopped = k;
		if (!active()) return;
		turn.a = tx("colFailed");
	}
	await tick();
	document.querySelector<HTMLInputElement>(`[data-ask="${m.n}"] input`)?.focus({ preventScroll: true });
}
const asking = $state<Record<number, string>>({});

function done() {
	const n = marks.filter((m) => m.data && !m.earlier).length;
	// Said on the home page, in its language (the interface's, not the tutor's).
	if (n) sessionStorage.setItem("homeToast", JSON.stringify(["colSaved", { n }]));
	goto("/");
}
onMount(() => {
	document.title = `${ui("colTitle")} · ${ui("homeTitle")}`;
	addEventListener("pointerup", up);
	return () => removeEventListener("pointerup", up);
});
const cls = (i: number) => {
	const s = segs[i];
	const m = markAt(i);
	const pv = preview && i >= preview[0] && i <= preview[1];
	return [
		s.isWordLike ? "w" : "",
		m ? "hl" : "",
		m && i === m.a ? "first" : "",
		m && i === m.b ? "last" : "",
		m && m.n === openN ? "on" : "",
		pv ? "pv" : "",
	]
		.filter(Boolean)
		.join(" ");
};
</script>

{#if SETUP}
	<FocusBar exit={{ label: ui("colDone"), onclick: done }} />
	<main class="wrap" lang={htmlLang(UI)}>
		<h1>{ui("colTitle")}</h1>
		<p class="how">{ui(touch ? "colHowTouch" : "colHowDesk")}</p>
		<div class="cols">
			<div class="sheet-card">
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<p class="passage" lang={SETUP.lang} onpointerdown={down} onpointermove={move}>
					{#each segs as s, i}
						{@const c = cls(i)}
						{#if c}
							<span class={c} data-i={i}>{s.segment}</span>
						{:else}
							{s.segment}
						{/if}
					{/each}
				</p>
			</div>
			<section aria-labelledby="kept-h">
				<div class="kept-head">
					<h2 id="kept-h">{ui("colKeptTitle")}</h2>
					<span>{sorted.length ? ui("colKept", { n: sorted.length }) : ""}</span>
				</div>
				{#if stopped}
					<div class="stop" transition:slide={{ duration: 250 }}><LimitNotice kind={stopped} tx={ui} lang={UI} onretry={retry} /></div>
				{/if}
				<div class="items">
					{#each sorted as m (m.n)}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
						<!-- biome-ignore lint/a11y/useKeyWithClickEvents: a pointer shortcut; the item's own buttons are the keyboard's way -->
						<article
							class="item"
							class:on={m.n === openN}
							data-item={m.n}
							in:fly={{ y: 8, duration: 250 }}
							onclick={(e) => {
								if (!(e.target as HTMLElement).closest("form, button")) openN = m.n;
							}}
						>
							<div class="item-top">
								<span class="phrase" lang={SETUP.lang}>{m.data?.phrase ?? textOf(m)}</span>
								<Button
									variant="ghost"
									size="icon-sm"
									class="-me-1.5 -mt-1 text-muted-foreground"
									aria-label={ui("colRemove")}
									title={ui("colRemove")}
									onclick={() => drop(m)}
									><X aria-hidden="true" /></Button
								>
							</div>
							<div class="said" lang={htmlLang(LANG)}>
								{#if !m.data}
									{#if m.failed}
										<p class="why">{tx("colFailed")} <button type="button" class="text-link" onclick={retry}>{tx("colRetry")}</button></p>
									{:else}
										<div class="filling">
											<span class="wait-dots"><i></i><i></i><i></i></span>{tx("colFilling")}
										</div>
									{/if}
								{:else}
									<span class="tag reg">{tx(REG[m.data.register] ?? "regNeutral")}</span>
									<p>{m.data.meaning}</p>
									<p class="why">{m.data.why}</p>
									<p class="ex" lang={SETUP.lang}>{m.data.example}</p>
									<div class="thread">
										{#each m.thread as turn}
											<div class="q">{turn.q}</div>
											<div class="a">
												{#if turn.a === null}
													<span class="wait-dots"><i></i><i></i><i></i></span>
												{:else}
													{turn.a}
												{/if}
											</div>
										{/each}
									</div>
									{#if !m.thread.length}
										<div class="quick">
											{#each ["colQ1", "colQ2"] as k}
												<button type="button" onclick={() => askAbout(m, tx(k))}>{tx(k)}</button>
											{/each}
										</div>
									{/if}
									<form
										class="ask"
										data-ask={m.n}
										onsubmit={(e) => {
											e.preventDefault();
											const q = (asking[m.n] ?? "").trim();
											if (!q) return;
											asking[m.n] = "";
											askAbout(m, q);
										}}
									>
										<input bind:value={asking[m.n]} autocomplete="off" placeholder={tx("colAskPh")} aria-label={tx("colAskPh")}>
										<Button variant="secondary" size="sm" type="submit">{tx("colAsk")}</Button>
									</form>
								{/if}
							</div>
						</article>
					{:else}
						<p class="none">{ui("colEmpty")}</p>
					{/each}
				</div>
			</section>
		</div>
	</main>
{/if}

<style>
.wrap {
	width: min(1120px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(18px, 6vh, 60px) 0 80px;
}
h1 {
	text-align: center;
	font-size: clamp(26px, 3.8vw, 34px);
	margin-bottom: 6px;
}
:global(html[data-vt="/>/collect"]) h1,
:global(html[data-vt="/collect>/"]) h1 {
	view-transition-name: hero-title;
}
.how {
	text-align: center;
	margin: 0 0 24px;
	color: var(--muted);
	font-size: 14px;
}
.cols {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
	gap: 24px;
	align-items: start;
}
/* The passage is a sheet of the same paper (and airmail edge) as the box it came from, lying on the desk. */
.sheet-card {
	position: sticky;
	top: 16px;
	background: var(--raised);
	border: 1px solid var(--edge);
	border-radius: 6px;
	box-shadow: var(--paper-lift);
	padding: 0 24px 22px;
	overflow: hidden;
}
:global(html[data-vt="/>/collect"]) .sheet-card,
:global(html[data-vt="/collect>/"]) .sheet-card {
	view-transition-name: card;
}
.sheet-card::before {
	content: "";
	display: block;
	margin: 0 -24px 18px;
	height: 5px;
	background: repeating-linear-gradient(-45deg, #c4674e 0 12px, transparent 12px 18px, #5b7aa6 18px 30px, transparent 30px 36px);
	opacity: 0.55;
}
@media (max-width: 900px) {
	.cols {
		grid-template-columns: 1fr;
	}
	.sheet-card {
		position: static;
	}
}
.passage {
	margin: 0;
	font: 17px / 1.75 var(--font-serif-stack);
	color: var(--ink);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	user-select: none;
	-webkit-user-select: none;
	touch-action: manipulation;
}
.passage :global(.w) {
	cursor: text;
	border-radius: 3px;
	transition: background-color 0.12s;
}
.passage :global(.w:hover) {
	background: var(--hover);
}
/* A highlight is marker ink behind the words, joined across the spaces between them. */
.passage :global(.hl) {
	background: color-mix(in srgb, #f2c94c 45%, transparent);
	cursor: pointer;
	border-radius: 0;
}
:global([data-theme="dark"]) .passage :global(.hl) {
	background: color-mix(in srgb, #c9a227 38%, transparent);
}
.passage :global(.hl.on) {
	background: color-mix(in srgb, #f2c94c 75%, transparent);
}
:global([data-theme="dark"]) .passage :global(.hl.on) {
	background: color-mix(in srgb, #c9a227 60%, transparent);
}
.passage :global(.pv) {
	background: color-mix(in srgb, #f2c94c 30%, transparent);
}
.passage :global(.first) {
	border-start-start-radius: 4px;
	border-end-start-radius: 4px;
}
.passage :global(.last) {
	border-start-end-radius: 4px;
	border-end-end-radius: 4px;
}
.kept-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	margin: 0 2px 10px;
}
.kept-head h2 {
	font-size: 20px;
}
.kept-head span {
	color: var(--muted);
	font-size: 13px;
}
.stop {
	margin-bottom: 12px;
}
.items {
	display: grid;
	gap: 10px;
}
.item {
	padding: 14px 16px;
	border-radius: 6px;
	background: var(--card-bg);
	border: 1px solid var(--edge);
	transition:
		border-color 0.15s,
		box-shadow 0.15s;
}
.item.on {
	border-color: var(--line);
	box-shadow: var(--paper-lift-hi);
}
.item-top {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}
.phrase {
	flex: 1;
	font: 19px / 1.35 var(--font-serif-stack);
}
.reg {
	margin: 6px 0 2px;
}
.item p {
	margin: 6px 0 0;
	font-size: 14px;
	color: var(--ink-2);
	line-height: 1.55;
}
.item .why {
	color: var(--muted);
	font-size: 13.5px;
}
.item .ex {
	font-family: var(--font-serif-stack);
	font-size: 15px;
	color: var(--ink);
}
.item .ex::before {
	content: "→ ";
	color: var(--muted);
}
.filling {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 6px;
	color: var(--muted);
	font-size: 13px;
}
.thread {
	margin-top: 10px;
	display: grid;
	gap: 8px;
}
.thread .q {
	justify-self: end;
	max-width: 90%;
	padding: 6px 10px;
	border-radius: 6px 6px 4px 6px;
	background: var(--btn);
	font-size: 13.5px;
}
.thread .a {
	font-size: 14px;
	color: var(--ink-2);
	white-space: pre-wrap;
}
.ask {
	display: flex;
	gap: 6px;
	margin-top: 10px;
}
.ask input {
	flex: 1;
	min-width: 0;
	height: 32px;
	padding: 0 10px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: var(--field);
	color: var(--ink);
	font-size: 14px;
}
.ask input:focus {
	outline: 0;
	border-color: color-mix(in srgb, var(--ink) 30%, transparent);
}
.quick {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 10px;
}
.quick button {
	height: 28px;
	padding: 0 10px;
	border-radius: 6px;
	border: 1px solid var(--line);
	background: transparent;
	color: var(--ink-2);
	font-size: 12.5px;
	cursor: pointer;
	transition:
		background-color 150ms,
		color 150ms,
		scale 150ms;
}
.quick button:hover {
	background: var(--hover);
	color: var(--ink);
}
.quick button:active {
	scale: 0.97;
}
.none {
	padding: 22px 16px;
	border: 1px dashed var(--line);
	border-radius: 6px;
	color: var(--muted);
	font-size: 14px;
	text-align: center;
}
.wait-dots {
	display: inline-flex;
	gap: 4px;
}
.wait-dots i {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: currentColor;
	animation: breathe 1.2s ease-in-out infinite;
}
.wait-dots i:nth-child(2) {
	animation-delay: 0.15s;
}
.wait-dots i:nth-child(3) {
	animation-delay: 0.3s;
}
@keyframes breathe {
	0%,
	100% {
		opacity: 0.25;
	}
	50% {
		opacity: 1;
	}
}
@media (pointer: coarse) {
	.passage {
		font-size: 18px;
		line-height: 1.9;
	}
	.ask input {
		height: 40px;
	}
}
</style>
