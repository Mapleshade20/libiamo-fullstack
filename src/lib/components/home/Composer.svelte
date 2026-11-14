<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Highlighter from "@lucide/svelte/icons/highlighter";
import Link2 from "@lucide/svelte/icons/link-2";
import NotebookPen from "@lucide/svelte/icons/notebook-pen";
import PenLine from "@lucide/svelte/icons/pen-line";
import { onMount, tick } from "svelte";
import LimitNotice from "#lib/components/common/LimitNotice.svelte";
import { autogrow, reducedMotion, shake } from "#lib/components/common/motion.ts";
import Notice from "#lib/components/common/Notice.svelte";
import Reveal from "#lib/components/common/Reveal.svelte";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import { tip } from "#lib/components/common/tip.ts";
import { CALLS } from "#lib/components/debug/calls.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { app, endonym, nameOf, read, toast, tx, write } from "#lib/demo/app.svelte.ts";
import { COLLECT_KEY } from "#lib/demo/data.ts";
import { dev } from "#lib/demo/dev.svelte.ts";
import { keyStop } from "#lib/demo/limits.ts";
import { sourceStatus } from "#lib/demo/source.ts";
import { startPiece } from "#lib/session/start.ts";
import { goto } from "$app/navigation";

/*
 * The box on the home page, for one of two things: the learner's own writing (checked over two passes on the session
 * page) or something they read and want to steal phrases from (the collect page). The draft and its bar never move;
 * what is added (notes, the page it is for, what the door says) opens below the bar. The bar is icons, each named by
 * its tip, so it fits any width; ⌘/Ctrl+Enter sends from anywhere on the page.
 */
type Draft = { text: string; background: string; source: string; notes: boolean; ctx: boolean; grab: boolean; mode: "check" | "collect" };
const storeKey = "homeDraft";
const draft = $state<Draft>({
	text: "",
	background: "",
	source: "",
	notes: false,
	ctx: false,
	grab: false,
	mode: "check",
	...read<Partial<Draft>>(storeKey, {}),
});
// What the learner is writing stays on this device until they send it, so a reload or a closed tab loses nothing.
$effect(() => write(storeKey, $state.snapshot(draft)));

const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const touch = matchMedia("(pointer: coarse)").matches;
const collect = $derived(draft.mode === "collect");
const status = $derived(sourceStatus(draft.source, tx));
const placeholderFor = (mode: string) => tx(mode === "collect" ? "collectPlaceholder" : "composePlaceholder");
let placeholder = $state(placeholderFor(draft.mode));
let area: HTMLTextAreaElement | undefined = $state();
let bg: HTMLTextAreaElement | undefined = $state();
let src: HTMLTextAreaElement | undefined = $state();
let card: HTMLElement | undefined = $state();
let statusEl: HTMLElement | undefined = $state();
let gateEl: HTMLElement | undefined = $state();

// Switching what the box is for keeps the words (a paste often lands in the wrong one). The writing mode's chips fade
// where they stand; its open parts fold away under the bar and come back with it; the placeholder blurs to its new words.
$effect(() => {
	const next = placeholderFor(draft.mode);
	if (next === placeholder) return;
	if (area && !area.value && !reducedMotion()) {
		area.animate(
			[
				{ filter: "blur(0)", opacity: 1 },
				{ filter: "blur(3px)", opacity: 0.3 },
				{ filter: "blur(0)", opacity: 1 },
			],
			{ duration: 300, easing: "ease-in-out" },
		);
		setTimeout(() => (placeholder = next), 140);
	} else placeholder = next;
});

async function toggle(part: "notes" | "ctx") {
	draft[part] = !draft[part];
	await tick();
	if (draft[part]) setTimeout(() => (part === "ctx" ? src : bg)?.focus({ preventScroll: true }), 60);
	else area?.focus({ preventScroll: true });
}

/* ---------- The door: is this something to work on, and in which language (src/gate.ts)? ---------- */
type Gate = { verdict: "ok" | "ask" | "reject"; reason?: string; lang?: string };
let gate = $state<{ g: Gate; text: string } | null>(null);
/* No key stops a send before anything is asked, and says so in the same place as the door. */
let stopped = $state<{ kind: "nokey"; text: string } | null>(null);
let checking = $state(false);
// Editing answers the door: what it said goes away, and the next send asks again.
$effect(() => {
	if (gate && draft.text !== gate.text) gate = null;
	if (stopped && draft.text !== stopped.text) stopped = null;
});
$effect(() => {
	void draft.mode;
	gate = null;
	stopped = null;
});
const gateCopy = $derived.by(() => {
	if (!gate) return null;
	const g = gate.g;
	const lang = g.lang ? nameOf(g.lang) : "";
	const vars = { lang: g.reason === "native" ? nameOf(app.prefs.native) : lang, native: nameOf(app.prefs.native), target: nameOf(app.lang) };
	const reject = g.verdict === "reject";
	const actions: [string, string, boolean?][] = reject
		? []
		: ((
				{
					native: [["anyway", tx("gateAnyway")]],
					unsure: [["anyway", tx("gateAnyway")]],
					addLang: [["add", tx("gateAdd", { lang }), true]],
					published: [
						["collect", tx("gateCollect"), true],
						["anyway", tx("gateMine")],
					],
				} as Record<string, [string, string, boolean?][]>
			)[g.reason ?? ""] ?? []);
	return {
		tone: reject ? ("warning" as const) : ("info" as const),
		title: reject ? tx("gateTitleReject") : tx(`gateTitle_${g.reason}`),
		body: tx(reject ? `gate_${g.reason}${g.reason === "native" ? "Collect" : ""}` : `gateAsk_${g.reason}`, vars),
		actions,
	};
});

async function start() {
	if (checking) return;
	if (!draft.text.trim()) {
		area?.focus();
		shake(card);
		return;
	}
	// Asked again with nothing changed: point at what was said instead of saying it again.
	if (gate && gate.text === draft.text) {
		shake(gateEl?.querySelector("[role]"));
		gateEl?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
		return;
	}
	const noKey = keyStop();
	if (noKey) {
		if (stopped) shake(gateEl?.querySelector("[role]"));
		stopped = { kind: noKey, text: draft.text };
		return;
	}
	stopped = null;
	const source = draft.ctx && !collect ? draft.source : "";
	if (sourceStatus(source, tx).kind === "broken") {
		shake(statusEl);
		src?.focus();
		return;
	}
	checking = true;
	let g: Gate | null = null;
	try {
		g = await CALLS.traced("/api/gate", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ mode: draft.mode, text: draft.text, native: app.prefs.native, learning: app.prefs.learning, active: app.lang }),
		}).then((r: Response) => r.json());
	} catch {
		g = null; // The door never keeps anyone out by failing.
	}
	checking = false;
	if (g && g.verdict !== "ok") {
		gate = { g, text: draft.text };
		return;
	}
	go(g?.lang ?? app.lang);
}
function act(k: string) {
	const g = gate?.g;
	if (k === "collect") {
		draft.mode = "collect";
		gate = null;
		tick().then(start);
		return;
	}
	if (k === "add" && g?.lang && !app.prefs.learning.includes(g.lang)) {
		app.prefs.learning.push(g.lang);
		app.save();
		toast(tx("setAdded", { lang: endonym(g.lang) }));
	}
	go(g?.lang && app.prefs.learning.includes(g.lang) ? g.lang : app.lang);
}
// The box is emptied for the next thing, as a sent message leaves it. Collecting reads its handoff once; writing
// becomes a piece first, and its page opens on it.
async function go(lang: string) {
	const text = draft.text;
	gate = null;
	if (collect) {
		draft.text = "";
		sessionStorage.setItem(
			COLLECT_KEY,
			JSON.stringify({ passage: text, lang, native: app.prefs.native, feedback: app.prefs.feedback, model: dev.grader }),
		);
		goto("/collect");
		return;
	}
	const notes = draft.notes ? draft.background : "";
	checking = true;
	const id = await startPiece({
		text,
		background: notes,
		source: draft.ctx ? draft.source : "",
		...$state.snapshot(dev),
		learner: app.prefs.native,
		feedback: app.prefs.feedback as "native" | "target",
		lang,
	}).catch(() => null);
	checking = false;
	if (!id) return toast(tx("startFailed"));
	draft.text = "";
	goto(`/live/${id}`);
}

// A page captured with a script, pasted where the draft goes, is context: it moves there and says so.
async function onPaste(e: ClipboardEvent) {
	if (collect) return;
	const text = e.clipboardData?.getData("text") ?? "";
	if (!text.trim() || sourceStatus(text, tx).kind === "text") return;
	e.preventDefault();
	draft.source = text;
	draft.ctx = true;
	toast(tx("srcMoved"));
}
const scripts = fetch("/api/capture-scripts").then((r) => r.json() as Promise<Record<string, string>>);
async function copyScript(k: string) {
	await navigator.clipboard.writeText((await scripts)[k]);
	toast(tx("grabCopied"));
}

onMount(() => {
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.isComposing || e.repeat) return;
		if ((document.activeElement as HTMLElement | null)?.closest?.(".dev, .floating-panel")) return;
		e.preventDefault();
		start();
	};
	addEventListener("keydown", onKey);
	return () => removeEventListener("keydown", onKey);
});

/** The developer settings fill the box with a test draft. */
export function fill(f: { text: string; background?: string }) {
	Object.assign(draft, { text: f.text, background: f.background ?? "", notes: !!f.background, mode: "check" });
}
</script>

<div class="composer" bind:this={card}>
	<div class="step">
		<textarea
			id="draft"
			rows="3"
			spellcheck="false"
			aria-label={placeholder}
			{placeholder}
			bind:this={area}
			bind:value={draft.text}
			use:autogrow={draft.text}
			onpaste={onPaste}
		></textarea>
		<div class="bar">
			<SegmentedControl
				label={tx("modeLabel")}
				size="sm"
				iconsOnNarrow
				bind:value={draft.mode}
				items={[
					{ value: "check", label: tx("modeCheck"), icon: PenLine },
					{ value: "collect", label: tx("modeCollect"), icon: Highlighter },
				]}
			/>
			<div class="chips" class:away={collect} inert={collect}>
				<button
					type="button"
					class="chip"
					aria-expanded={draft.notes && !collect}
					aria-controls="notes"
					use:tip={tx("addNotes")}
					onclick={() => toggle("notes")}
				>
					<NotebookPen aria-hidden="true" />
				</button>
				<button
					type="button"
					class="chip"
					aria-expanded={draft.ctx && !collect}
					aria-controls="ctx"
					use:tip={tx("addContext")}
					onclick={() => toggle("ctx")}
				>
					<Link2 aria-hidden="true" />
				</button>
			</div>
			<span class="grow"></span>
			<button
				type="button"
				class="go key"
				use:tip={`${tx(collect ? "collectGo" : "composeGo")}${touch ? "" : `  ${mac ? "⌘" : "Ctrl"} ↵`}`}
				disabled={!draft.text.trim()}
				aria-busy={checking}
				onclick={start}
			>
				{#if checking}
					<span class="spin" aria-hidden="true"></span>
				{:else}
					<ArrowUp class="size-[17px]" strokeWidth={2.4} aria-hidden="true" />
				{/if}
			</button>
		</div>
	</div>
	<Reveal open={draft.notes && !collect}>
		<div class="extra" id="notes">
			<label class="label" for="bg">{tx("bgOpt")}</label>
			<textarea
				id="bg"
				rows="1"
				placeholder={tx("bgPlaceholder")}
				bind:this={bg}
				bind:value={draft.background}
				use:autogrow={draft.background}
			></textarea>
		</div>
	</Reveal>
	<Reveal open={draft.ctx && !collect}>
		<div class="extra" id="ctx">
			<div class="label-row">
				<label class="label" for="src">{tx("srcOpt")}</label>
				<button type="button" class="text-link" aria-expanded={draft.grab} aria-controls="grab" onclick={() => (draft.grab = !draft.grab)}>
					{tx("grabLink")}
				</button>
			</div>
			<Reveal open={draft.grab}>
				<div class="grab" id="grab">
					<p>{tx("grabHow")}</p>
					<div class="row">
						{#each [
							["ao3", "AO3"],
							["reddit", "Reddit"],
							["discord", "Discord"],
						] as [k, site] (k)}
							<Button variant="secondary" size="sm" onclick={() => copyScript(k)}>{tx("grabCopy", { site })}</Button>
						{/each}
					</div>
				</div>
			</Reveal>
			<textarea
				id="src"
				rows="2"
				spellcheck="false"
				placeholder={tx("srcPlaceholder")}
				bind:this={src}
				bind:value={draft.source}
				use:autogrow={draft.source}
			></textarea>
			{#if status.line}
				<p class="status" class:bad={status.kind === "broken"} aria-live="polite" bind:this={statusEl}>{status.line}</p>
			{/if}
		</div>
	</Reveal>
	<Reveal open={!!gateCopy || !!stopped}>
		<div class="gate" bind:this={gateEl}>
			{#if stopped}
				<LimitNotice kind={stopped.kind} {tx} lang={app.lang} />
			{:else if gateCopy}
				<Notice tone={gateCopy.tone} title={gateCopy.title} role="status">
					<p>{gateCopy.body}</p>
					{#if gateCopy.actions.length}
						<div class="mt-2.5 flex flex-wrap gap-1.5">
							{#each gateCopy.actions as [k, label, primary] (k)}
								<Button size="sm" variant={primary ? "default" : "ghost"} onclick={() => act(k)}>{label}</Button>
							{/each}
						</div>
					{/if}
				</Notice>
			{/if}
		</div>
	</Reveal>
</div>

<style>
/* The composer is a letter lying on the desk: paper with an airmail edge along its top. While it is being written in,
   the letter lifts a little and its airmail edge brightens. */
.composer {
	position: relative;
	background: var(--raised);
	border: 1px solid var(--edge);
	border-radius: 6px;
	box-shadow: var(--paper-lift);
	transition:
		box-shadow 200ms,
		border-color 200ms;
	overflow: hidden;
}
.composer::before {
	content: "";
	display: block;
	height: 5px;
	background: repeating-linear-gradient(-45deg, #c4674e 0 12px, transparent 12px 18px, #5b7aa6 18px 30px, transparent 30px 36px);
	opacity: 0.55;
	transition:
		opacity 200ms var(--ease-panel),
		filter 200ms var(--ease-panel);
}
.composer:focus-within {
	border-color: var(--line);
	box-shadow: var(--paper-lift-hi);
}
.composer:focus-within::before {
	opacity: 1;
	filter: saturate(1.25) brightness(1.08);
}
/* Carried into the session's scene card and the collect page (root layout names the trip). */
:global(html[data-vt="/>/live"]) .composer,
:global(html[data-vt="/>/collect"]) .composer,
:global(html[data-vt="/live>/"]) .composer,
:global(html[data-vt="/collect>/"]) .composer {
	view-transition-name: card;
}
.step {
	padding: 14px 14px 12px 18px;
}
#draft {
	display: block;
	width: 100%;
	min-height: 78px;
	max-height: 46vh;
	resize: none;
	border: 0;
	outline: 0;
	padding: 4px 4px 8px 0;
	background: transparent;
	color: var(--ink);
	font: 16px / 1.6 var(--font-sans-stack);
}
#draft::placeholder {
	color: var(--muted);
}
.bar {
	display: flex;
	align-items: center;
	gap: 8px;
}
.grow {
	flex: 1;
}
/* What the learner can add: an icon toggle each (named by its tip); on, it is inked and the part opens under the bar. */
.chip {
	display: inline-grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 6px;
	background: transparent;
	color: var(--muted);
	cursor: pointer;
	transition:
		color 150ms,
		background-color 150ms,
		scale 150ms;
}
.chip:hover {
	background: var(--hover);
	color: var(--ink);
}
.chip:active {
	scale: 0.97;
}
.chip :global(svg) {
	width: 17px;
	height: 17px;
}
.chip[aria-expanded="true"] {
	background: color-mix(in srgb, var(--ink) 9%, transparent);
	color: var(--ink);
}
.chip:focus-visible,
.go:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.chips {
	display: flex;
	gap: 8px;
	transition:
		opacity 150ms var(--ease-panel),
		transform 150ms var(--ease-panel);
}
.chips.away {
	opacity: 0;
	transform: translateY(2px);
	pointer-events: none;
}
.grow {
	min-width: 0;
}
.go {
	display: inline-grid;
	place-items: center;
	width: 36px;
	height: 36px;
	flex: none;
	border: 0;
	border-radius: 6px;
	cursor: pointer;
}
.go:disabled {
	opacity: 0.3;
	cursor: default;
}
.spin {
	width: 16px;
	height: 16px;
	border-radius: 50%;
	border: 2px solid color-mix(in srgb, var(--bg) 35%, transparent);
	border-top-color: var(--bg);
	animation: spin 700ms linear infinite;
}
@keyframes spin {
	to {
		transform: rotate(360deg);
	}
}
.extra {
	margin: 0 14px;
	padding: 12px 4px 14px;
	border-top: 1px solid var(--line-soft);
}
.label {
	display: block;
	font-size: 13px;
	color: var(--muted);
	margin: 0 0 6px;
}
.label-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 12px;
}
.extra textarea {
	display: block;
	width: 100%;
	resize: none;
	border: 1px solid transparent;
	border-radius: 6px;
	padding: 8px 10px;
	background: var(--well);
	color: var(--ink);
	font: 14.5px / 1.6 var(--font-sans-stack);
	transition:
		background-color 150ms,
		border-color 150ms;
}
.extra textarea:focus {
	outline: 0;
	background: var(--raised);
	border-color: color-mix(in srgb, var(--ink) 25%, transparent);
}
.extra textarea::placeholder {
	color: var(--muted);
}
#src {
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 12.5px;
	max-height: 9.5em;
}
.grab {
	margin: 0 0 8px;
	padding: 10px 12px;
	border-radius: 6px;
	background: var(--well);
	font-size: 13px;
	color: var(--ink-2);
}
.grab p {
	margin: 0 0 8px;
}
.grab .row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.status {
	margin: 6px 2px 0;
	font-size: 12.5px;
	color: var(--muted);
}
.status.bad {
	color: var(--bad);
}
/* What the door says: a notice under the bar, in the box, never a toast. */
.gate {
	padding: 0 12px 12px;
}
.gate :global(p) {
	margin: 0;
}
@media (max-width: 640px) {
	.step {
		padding: 12px 12px 12px 14px;
	}
	.bar,
	.chips {
		gap: 6px;
	}
}
@media (pointer: coarse) {
	.go {
		width: 44px;
		height: 44px;
	}
	.chip {
		width: 40px;
		height: 40px;
	}
}
</style>
