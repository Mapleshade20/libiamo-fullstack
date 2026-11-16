<script lang="ts">
import { cubicInOut } from "svelte/easing";
import { fly } from "svelte/transition";
import LimitNotice from "#lib/components/common/LimitNotice.svelte";
import { reducedMotion } from "#lib/components/common/motion.ts";
import type { Msg, Session } from "#lib/session/session.svelte.ts";
import { rich } from "#lib/session/text.ts";
import ArgumentMap from "./ArgumentMap.svelte";
import HintBox from "./HintBox.svelte";
import Speaker from "./Speaker.svelte";

/*
 * Pass 2's conversation: each spot is one comment tree (the reader's line on top, the tutor and the learner below).
 * A finished spot steps back so the open one stands out; something that leaves the conversation folds away instead
 * of vanishing. The thread scrolls only after the learner acts (the session moves it).
 */
let { session }: { session: Session } = $props();
let list: HTMLDivElement | undefined = $state();
$effect(() => {
	session.thread = list ?? null;
});
const people = $derived(session.people());
const kinds = { tutor: "tutor", reader: "reader", me: "me" } as const;

/** Folding away: the height closes while it fades. */
function fold(node: HTMLElement) {
	if (reducedMotion()) return { duration: 0 };
	const h = node.offsetHeight;
	return { duration: 500, css: (t: number) => `overflow:hidden;height:${cubicInOut(t) * h}px;opacity:${Math.min(1, t * 1.4)};margin:0` };
}
/** Said right after another message of theirs: it goes on under the same name. */
const follows = (list: Msg[], i: number) => {
	const m = list[i];
	const p = list[i - 1];
	return !!(m.who && p?.who === m.who && p.kind !== "thinking" && p.kind !== "fail");
};
const settle = (node: Element) => (reducedMotion() ? { duration: 0 } : fly(node, { y: 6, duration: 600 }));
</script>

{#snippet message(m: Msg, grouped: boolean)}
	<div data-mid={m.id} in:settle out:fold>
		{#if m.kind === "thinking"}
			<div class="thinking" role="status" aria-label={session.tt("generating")}>
				<span class="space"></span><span class="wait-dots"><i></i><i></i><i></i></span>
			</div>
		{:else if m.kind === "fail"}
			<div class="fail"><LimitNotice kind={m.halt ?? "error"} tx={session.tt} lang={session.lang} onretry={m.retry} /></div>
		{:else if m.kind === "turns" && m.turns}
			<ol class="turns" aria-label={session.tt("howWent")}>
				{#each m.turns as t (t.t)}
					<li class:off={!t.ok}>
						<span class="mark" role="img" aria-label={session.tt(t.ok ? "landedOk" : "landedOff")}>{t.ok ? "✓" : "!"}</span>
						<div class="body">
							<p class="mine">{t.mine}</p>
							{#if t.by && t.reply}
								<p class="reply"><b>{t.by}</b> {t.reply}</p>
							{/if}
							{#if !t.ok}
								<p class="why">{t.why}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{:else if m.kind === "map" && session.map}
			<ArgumentMap
				rows={session.map.rows}
				frozen={session.map.frozen}
				labels={{ fix: session.tt("stFix"), miss: session.tt("stMiss"), aria: session.tt("mapAria") }}
				onselect={(r) => session.showRow(r)}
			/>
		{:else if m.who}
			<Speaker
				who={m.name ? { ...people[m.who], name: m.name } : people[m.who]}
				icon={people[m.who].icon}
				kind={kinds[m.who]}
				quiet={m.quiet}
				grouped={grouped && !m.name}
			>
				{#if m.kind === "explain" && m.explain}
					{@const x = m.explain}
					<p>{x.lead}</p>
					<!-- rich() escapes the sentence and marks its key choices. -->
					<div class="ref">{@html rich(x.ref.replace(/^,\s*/, "…"))}</div>
					{#if x.alts.length}
						<div class="alts">
							{session.tt("also")}
							{#each x.alts as a}
								<div>{a}</div>
							{/each}
						</div>
					{/if}
					<ul class="why">
						{#each x.rows as r}
							<li class={r.cls}>
								<span class="mk">{r.mk}</span
								><span
									><b>{r.label}</b>　
									{#if r.note}
										<span class="n">{r.note}</span>
									{/if}
									{#if r.yours}
										<span class="yours">{r.yours}</span>
									{/if}</span
								>
							</li>
						{/each}
					</ul>
				{:else if m.kind === "again"}
					{#if m.text}
						<p>{m.text}</p>
					{/if}
					<p class="cue"><s>{m.cue}</s></p>
				{:else if m.text}
					<p>{m.text}</p>
				{/if}
				{#if m.hint && session.hint}
					<div out:fold><HintBox hint={session.hint} ongrow={(el) => session.showInThread(el)} /></div>
				{/if}
			</Speaker>
		{/if}
	</div>
{/snippet}

<!-- While the end's retrieval is written, everything before it is veiled: the answer must not be a glance away. -->
<div class="thread" class:recalling={session.recalling} bind:this={list}>
	{#each session.stops as s (s.id)}
		<section class="stop" class:done={s.done} in:settle>
			<div class="top">
				{#each s.top as m, i (m.id)}
					{@render message(m, follows(s.top, i))}
				{/each}
			</div>
			<div class="replies">
				{#each s.replies as m, i (m.id)}
					{@render message(m, follows(s.replies, i))}
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
.thread {
	position: relative;
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding: 2px 2px 8px;
	scrollbar-width: thin;
	/* Short conversations sit right above the reply bar, like a chat. */
	display: flex;
	flex-direction: column;
}
.thread > :global(:first-child) {
	margin-top: auto;
}
.thread > :global(*) {
	flex: none;
}
.stop {
	background: var(--raised);
	border: 1px solid var(--edge);
	border-radius: 6px;
	padding: 12px 18px 2px;
	margin-bottom: 10px;
	box-shadow: var(--paper-lift);
	transition:
		background-color 0.6s ease,
		filter 250ms var(--ease-panel),
		opacity 250ms var(--ease-panel);
}
.thread.recalling .stop:not(:last-of-type) {
	filter: blur(6px);
	opacity: 0.4;
	pointer-events: none;
	user-select: none;
}
.replies {
	margin-left: 13px;
	padding-left: 21px;
	border-left: 2px solid var(--line-soft);
}
.replies:empty {
	display: none;
}
.stop > .top,
.stop > .replies {
	transition: opacity 0.6s ease;
}
.stop.done {
	background: var(--raised-dim);
	box-shadow: none;
}
.stop.done > .top,
.stop.done > .replies {
	opacity: 0.6;
}
p {
	margin: 0 0 4px;
}
.thinking {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 28px;
	margin-bottom: 10px;
}
.thinking .space {
	width: 28px;
	flex: none;
}
.fail {
	margin: 2px 0 12px;
}
.ref {
	font-family: var(--font-serif-stack);
	font-size: 17px;
	line-height: 1.6;
	margin-top: 2px;
}
.ref :global(.kw) {
	font-weight: 600;
	background: linear-gradient(transparent 62%, color-mix(in srgb, var(--reader) 20%, transparent) 0);
}
.ref :global(.ph) {
	padding: 0 6px;
	border: 1.5px dashed color-mix(in srgb, var(--reader) 55%, transparent);
	border-radius: 5px;
	font-family: var(--font-sans-stack);
	font-size: 0.82em;
	color: var(--reader);
}
.alts {
	margin-top: 6px;
	font-size: 14px;
	color: var(--muted);
}
.alts div {
	color: var(--ink);
}
.why {
	list-style: none;
	padding: 0;
	margin: 10px 0 0;
	display: grid;
	gap: 4px;
}
.why li {
	display: grid;
	grid-template-columns: 22px 1fr;
	gap: 0 8px;
	font-size: 14px;
	line-height: 1.55;
}
.why .mk {
	font-weight: 600;
	color: var(--tutor);
	text-align: center;
}
.why li.ok .mk {
	color: var(--ok);
}
.why li.free .mk {
	color: var(--muted);
	font-weight: 400;
}
.why b {
	font-family: var(--font-serif-stack);
	font-weight: 600;
	font-size: 15px;
}
.why li.ok .n {
	color: var(--muted);
}
.why .yours {
	display: block;
	margin-top: 2px;
}
.turns {
	list-style: none;
	margin: 2px 0 12px 38px;
	padding: 0;
	display: grid;
	gap: 8px;
}
.turns li {
	display: grid;
	grid-template-columns: 20px 1fr;
	gap: 8px;
	padding: 8px 10px;
	border-radius: 6px;
	background: var(--well);
	font-size: 14px;
	line-height: 1.5;
}
.turns .mark {
	display: inline-grid;
	place-items: center;
	width: 20px;
	height: 20px;
	border-radius: 50%;
	font-size: 12px;
	font-weight: 700;
	color: var(--ok);
	background: color-mix(in srgb, var(--ok) 14%, transparent);
}
.turns li.off .mark {
	color: var(--tutor);
	background: color-mix(in srgb, var(--tutor) 14%, transparent);
}
.turns p {
	margin: 0;
}
.turns .mine {
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	white-space: pre-line;
}
.turns .reply {
	margin-top: 3px;
	color: var(--muted);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.turns .reply b {
	color: var(--reader-who);
	font-weight: 600;
	margin-inline-end: 4px;
}
.turns .why {
	margin-top: 4px;
}
@media (max-width: 760px) {
	.turns {
		margin-left: 0;
	}
}
.cue {
	margin-top: 6px;
	padding: 8px 12px;
	border-radius: 6px;
	background: var(--well);
	font-family: var(--font-serif-stack);
	font-size: 16px;
	color: var(--muted);
}
.cue s {
	text-decoration-color: color-mix(in srgb, var(--tutor) 70%, transparent);
	text-decoration-thickness: 1.5px;
}
@media (max-width: 760px) {
	.stop {
		padding: 10px 12px 2px;
	}
	.replies {
		padding-left: 12px;
	}
}
</style>
