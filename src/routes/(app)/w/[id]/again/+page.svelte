<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Check from "@lucide/svelte/icons/check";
import Circle from "@lucide/svelte/icons/circle";
import { tick } from "svelte";
import { fly } from "svelte/transition";
import { Collector } from "#lib/components/collect/collector.svelte.ts";
import Accordion from "#lib/components/common/Accordion.svelte";
import LimitNotice from "#lib/components/common/LimitNotice.svelte";
import { autogrow, shake } from "#lib/components/common/motion.ts";
import Situation from "#lib/components/scenario/Situation.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { app, sandboxed, toast, tx } from "#lib/demo/app.svelte.ts";
import { keptPiece, practised } from "#lib/demo/data.ts";
import { dev } from "#lib/demo/dev.svelte.ts";
import { scenarioById, situationOf } from "#lib/demo/scenarios.ts";
import { markReused, reused } from "#lib/review/reuse.ts";
import { pieceById } from "#lib/writing/writing.remote.ts";
import { wroteAgain } from "#lib/writing/writing.svelte.ts";
import { page } from "$app/state";

/*
 * Writing a piece again from memory, a few days on (the shelf's follow-up). The strongest retrieval there is: the whole
 * formulation, in use. No model call: the new text is laid beside the settled one, and the phrases worked out last
 * time are marked where they came back. It makes a light day of the week, as review does.
 */
const id = $derived(page.params.id ?? "");
const w = $derived(sandboxed() ? keptPiece(id) : await pieceById(id));
const r = $derived(w?.result);
const scenario = $derived(w?.scenarioId ? scenarioById(w.scenarioId) : undefined);
const s = $derived(scenario ? situationOf(scenario) : undefined);
// svelte-ignore state_referenced_locally
const collector = new Collector({ lang: app.lang, native: app.prefs.native, feedback: app.prefs.feedback, model: dev.grader });
let text = $state("");
let done = $state(false);
let area: HTMLTextAreaElement | undefined = $state();
const phrases = $derived(r?.learned.map((l) => l.text) ?? []);
const hits = $derived(done ? reused(text, phrases) : []);
const runs = $derived(done ? markReused(text, phrases) : []);
async function compare() {
	if (!text.trim() || !w) return shake(area);
	done = true;
	wroteAgain(w.id, text).catch(() => toast(tx("error")));
	practised("learned");
	await tick();
	document
		.getElementById("compare")
		?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
$effect(() => {
	document.title = `${tx("fuAgainTitle")} · ${tx("homeTitle")}`;
});
</script>

{#if !w || !r}
	<main class="again"><EmptyState art="box" title={tx("pcMissing")} action={{ label: tx("navWriting"), href: "/writing" }} /></main>
{:else}
	<main class="again">
		<a class="back" href="/w/{w.id}"><ArrowLeft class="size-4" aria-hidden="true" />{w.title}</a>
		<h1>{tx("fuAgainTitle")}</h1>
		<p class="lede">{tx("agLede")}</p>
		{#if s}
			<Accordion title={tx("agSituation")} class="mb-5">
				<Situation {s} lang={s.kind === "translate" ? s.sourceLang : app.lang} {collector} />
				{#if collector.halt}
					<div class="mt-3"><LimitNotice kind={collector.halt.kind} {tx} lang={app.lang} onretry={collector.halt.retry} /></div>
				{/if}
			</Accordion>
		{/if}
		<div class="box" class:locked={done}>
			<textarea
				bind:this={area}
				bind:value={text}
				use:autogrow={text}
				rows="5"
				placeholder={tx("agPlaceholder")}
				aria-label={tx("agPlaceholder")}
				readonly={done}
				lang={w.lang ?? app.lang}
			></textarea>
		</div>
		{#if !done}
			<div class="go"><Button onclick={compare} disabled={!text.trim()}>{tx("agCompare")}</Button></div>
		{:else}
			<section id="compare" class="compare" in:fly={{ y: 10, duration: 300 }}>
				<p class="score">{tx("agScore", { n: hits.filter(Boolean).length, m: phrases.length })}</p>
				<ul class="phrases">
					{#each phrases as p, i}
						<li class:hit={hits[i]}>
							{#if hits[i]}
								<Check class="size-4" aria-hidden="true" />
							{:else}
								<Circle class="size-4" aria-hidden="true" />
							{/if}
							<span lang={w.lang ?? app.lang}>{p}</span>
						</li>
					{/each}
				</ul>
				<div class="cols">
					<div>
						<h2 class="label">{tx("agNow")}</h2>
						<div class="text">
							{#each runs as run}
								{#if run.hit}
									<mark>{run.text}</mark>
								{:else}
									{run.text}
								{/if}
							{/each}
						</div>
					</div>
					<div>
						<h2 class="label">{tx("agSettled")}</h2>
						<div class="text settled">{r.final}</div>
					</div>
				</div>
				<div class="go">
					<Button variant="secondary" href="/w/{w.id}">{tx("agBack")}</Button>
					<Button variant="ghost" href="/">{tx("pcNew")}</Button>
				</div>
			</section>
		{/if}
	</main>
{/if}

<style>
.again {
	width: min(860px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(8px, 3vh, 28px) 0 96px;
}
.back {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	max-width: 100%;
	margin: 0 0 14px -8px;
	padding: 6px 8px;
	border-radius: 6px;
	color: var(--muted);
	font-size: 13.5px;
	text-decoration: none;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	transition:
		color 150ms,
		background-color 150ms;
}
.back:hover {
	color: var(--ink);
	background: var(--hover);
}
h1 {
	font-size: clamp(26px, 3.4vw, 32px);
	margin-bottom: 6px;
}
.lede {
	margin: 0 0 20px;
	color: var(--muted);
}
.box {
	padding: 14px 18px;
	border-radius: 6px;
	background: var(--raised);
	border: 1px solid var(--line);
	box-shadow: var(--shadow);
	transition:
		border-color 200ms,
		background-color 200ms;
}
.box:focus-within {
	border-color: color-mix(in srgb, var(--ink) 24%, transparent);
}
.box.locked {
	background: var(--card-bg);
}
textarea {
	display: block;
	width: 100%;
	min-height: 120px;
	resize: none;
	border: 0;
	outline: 0;
	background: transparent;
	color: var(--ink);
	font: 17px / 1.7 var(--font-serif-stack);
}
textarea::placeholder {
	color: var(--muted);
	font-family: var(--font-sans-stack);
	font-size: 15px;
}
.go {
	display: flex;
	gap: 8px;
	margin-top: 14px;
}
.compare {
	margin-top: 28px;
	scroll-margin-top: 16px;
}
.score {
	margin: 0 0 8px;
	font: 500 20px / 1.3 var(--font-serif-stack);
}
.phrases {
	list-style: none;
	margin: 0 0 22px;
	padding: 0;
	display: grid;
	gap: 4px;
}
.phrases li {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--muted);
	font-size: 14.5px;
}
.phrases li.hit {
	color: var(--ink);
}
.phrases li.hit :global(svg) {
	color: var(--ok);
}
.cols {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 20px;
}
@media (max-width: 760px) {
	.cols {
		grid-template-columns: 1fr;
	}
}
.label {
	margin: 0 0 6px;
	font: 500 13px / 1.4 var(--font-sans-stack);
	letter-spacing: 0;
	color: var(--muted);
}
.text {
	white-space: pre-wrap;
	font: 16px / 1.7 var(--font-serif-stack);
	padding: 14px 16px;
	border-radius: 6px;
	background: var(--card-bg);
	border: 1px solid var(--edge);
}
.text mark {
	background: color-mix(in srgb, var(--ok) 18%, transparent);
	color: inherit;
	border-radius: 3px;
}
.settled {
	color: var(--ink-2);
}
</style>
