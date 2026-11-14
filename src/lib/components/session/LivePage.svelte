<script lang="ts">
import "#lib/components/session/post.css";
import "#lib/components/session/card.css";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import Copy from "@lucide/svelte/icons/copy";
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import { debugging } from "#lib/client/debug.ts";
import Backdrop from "#lib/components/backdrop/Backdrop.svelte";
import LimitNotice from "#lib/components/common/LimitNotice.svelte";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import ReplyBar from "#lib/components/session/ReplyBar.svelte";
import SceneCard from "#lib/components/session/SceneCard.svelte";
import Speaker from "#lib/components/session/Speaker.svelte";
import Thread from "#lib/components/session/Thread.svelte";
import FocusBar from "#lib/components/shell/FocusBar.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { RTL_LANGS } from "#lib/constants.ts";
import { toast } from "#lib/demo/app.svelte.ts";
import { dev as demo, saveDev } from "#lib/demo/dev.svelte.ts";
import { loadLang } from "#lib/i18n/index.svelte.ts";
import { Post } from "#lib/session/post.ts";
import { type Resumed, Session } from "#lib/session/session.svelte.ts";
import type { Setup } from "#lib/session/types.ts";

/*
 * A piece's revision: the scene card, then the two passes over the draft, then the piece's own page. It starts from
 * what the page that created the piece handed over, or comes back to where it was (`resumed`: a reload, a restart,
 * another device). Its whole interface speaks the tutor's language; the post keeps the language it is written in.
 */
let { id, setup, resumed }: { id: string; setup: Setup; resumed: Resumed | null } = $props();
// The page is keyed by the piece: what it was opened with holds for its whole life.
// svelte-ignore state_referenced_locally
const session = new Session(setup, id, resumed);
session.toast = toast;
const tt = (k: string, v?: Record<string, string | number>) => session.tt(k, v);
const tx = tt;
const people = $derived(session.people());

let region: HTMLElement | undefined = $state();
let body: HTMLElement | undefined = $state();
let text: HTMLElement | undefined = $state();
let devCalls = $state(localStorage.getItem("devCalls") !== "off");
$effect(() => {
	document.documentElement.classList.toggle("no-calls", !devCalls);
	localStorage.setItem("devCalls", devCalls ? "on" : "off");
});

onMount(() => {
	if (!region || !body || !text) return;
	session.post = new Post(text, body, region, session.clock, () => session.phase === 2);
	loadLang(session.lang).then(() => session.start());
	// Enter, outside any control, takes a pass-1 note's "Continue".
	const onKey = (e: KeyboardEvent) => {
		if ((e.target as Element)?.closest?.("input, textarea, button, [role=listbox], a")) return;
		if (e.key === "Enter" && session.cont) {
			e.preventDefault();
			session.cont();
		}
	};
	addEventListener("keydown", onKey);
	return () => {
		removeEventListener("keydown", onKey);
		session.stop();
		session.post?.destroy();
	};
});
$effect(() => {
	document.title = `${session.scene?.title || setup.scenario?.title || tt("phaseScene")} · Libiamo`;
});
const where = $derived(session.scene?.community || session.scene?.site || setup.scenario?.site || "");
async function copyQuick() {
	await navigator.clipboard?.writeText(session.quick.text ?? "");
	toast(tt("copiedPost"));
}
</script>

<div class="session" lang={session.lang === "zh-CN" ? "zh-Hans" : session.lang} dir={RTL_LANGS.includes(session.lang) ? "rtl" : "ltr"}>
	{#if session.phase === 0}
		<Backdrop />
	{/if}
	<div class="bar" class:ruled={session.phase > 0}>
		<FocusBar exit={{ label: tt("leaveSession"), href: "/" }} />
	</div>
	<main class="region" class:scene={session.phase === 0} class:p1={session.phase === 1} class:p2={session.phase === 2} bind:this={region}>
		{#if session.phase === 0}
			<h1 class="scene-title">{setup.scenario?.title ?? tt("sceneHeading")}</h1>
			<SceneCard {session} />
		{/if}
		<article class="sheet" hidden={session.phase === 0}>
			<div class="sheet-head">
				<div>
					<div class="sheet-meta">
						{#if session.scene?.site || setup.scenario?.site}
							<span class="badge">{session.scene?.site || setup.scenario?.site}</span>
						{/if}
						<span class="sub">{session.phase === 1 ? tt("subDraft", { where }) : tt("subAfter", { where })}</span>
					</div>
				</div>
			</div>
			<div class="post-body" class:veiled={session.recalling} bind:this={body}>
				{#if session.waiting !== "no"}
					<div class="waiting-draft" class:leaving={session.waiting === "leaving"} role="status" aria-busy="true" aria-label={tt("readingDraft")}>
						{#each setup.text.split("\n\n") as p}
							<p class="para">{p}</p>
						{/each}
					</div>
				{/if}
				<div class="text" bind:this={text}></div>
				{#if session.failure}
					<div class="failure" in:fly={{ y: 4, duration: 300 }}>
						<LimitNotice kind={session.failure.kind} {tx} lang={session.lang} onretry={session.failure.retry} />
					</div>
				{/if}
				{#if session.p1end && people}
					{@const e = session.p1end}
					<div class="p1-card end" style:--who={people.tutor.color} in:fly={{ y: 4, duration: 500 }}>
						<Speaker who={people.tutor} icon="pen">{tt("p1endDone")}</Speaker>
						<div class="p1-actions col">
							<div class="stats">
								<div><b>{e.fixed}</b><span>{tt("statFixed")}</span></div>
								<div><b>{e.self}</b><span>{tt("statSelf")}</span></div>
							</div>
							<div class="go-row">
								<Button onclick={() => session.toPass2()}>{tt("toPass2")}<ArrowRight aria-hidden="true" /></Button>
								<!-- A scenario's or a translation's text is not the learner's to post anywhere: no half-finished copy. -->
								{#if !setup.exchange && !setup.translation}
									<Button variant="ghost" disabled={session.quick.busy || !!session.quick.text} onclick={() => session.quickPost()}
										>{tt("postNow")}</Button
									>
								{/if}
							</div>
							{#if session.quick.halt}
								<LimitNotice kind={session.quick.halt} {tx} lang={session.lang} onretry={() => session.quickPost()} />
							{/if}
							{#if session.quick.text}
								<div class="postbox" in:fly={{ y: 4, duration: 400 }}>{session.quick.text}</div>
								<Button variant="secondary" size="sm" onclick={copyQuick}><Copy aria-hidden="true" />{tt("copyThis")}</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</article>
		{#if session.phase === 2}
			<section class="convo">
				<Thread {session} />
				<ReplyBar {session} />
			</section>
		{/if}
	</main>
	{#if debugging()}
		<!-- Debug only (not part of the product): jump between the scene and the passes; show the model calls. -->
		<details class="dev">
			<summary>{tt("devTitle")}</summary>
			<div class="dev-body">
				<div class="phases">
					{#each [tt("phaseScene"), tt("phase1"), tt("phase2")] as name, i}
						<Button
							variant={session.phase === i ? "default" : "secondary"}
							size="sm"
							disabled={i > 0 && !session.scene}
							onclick={() => session.jump(i as 0 | 1 | 2)}
							>{name}</Button
						>
					{/each}
				</div>
				<div class="limits">
					<span>{tt("devLimits")}</span>
					<SegmentedControl
						label={tt("devLimits")}
						size="sm"
						bind:value={demo.limit}
						onValueChange={saveDev}
						items={[
							{ value: "none", label: tt("devLimitNone") },
							{ value: "nokey", label: tt("devLimitNoKey") },
							{ value: "refused", label: tt("devLimitRefused") },
							{ value: "fail", label: tt("devLimitFail") },
						]}
					/>
				</div>
				<label class="check"><input type="checkbox" bind:checked={devCalls}> {tt("devCalls")}</label>
			</div>
		</details>
	{/if}
</div>

<style>
.session {
	--col: min(860px, 100% - 48px);
	height: 100dvh;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	background: var(--bg);
	color: var(--ink);
}
.bar {
	position: relative;
	z-index: 2;
	flex: none;
	padding-bottom: 8px;
	border-bottom: 1px solid transparent;
	transition: border-color 0.4s var(--ease-panel);
}
.bar.ruled {
	border-bottom-color: var(--line-soft);
}
/* The page never scrolls; each phase scrolls only inside the region. */
.region {
	position: relative;
	z-index: 1;
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding: 20px 0 80px;
}
.region > :global(*) {
	width: var(--col);
	margin-inline: auto;
}
/* The scene card stands where the home page's box stood: the heading where the greeting was, the box under it. */
.region.scene {
	--col: min(720px, 100% - 40px);
	padding: clamp(20px, 6vh, 80px) 0 calc(max(30vw, 34vh) * 0.6);
}
.scene-title {
	text-align: center;
	font-size: clamp(26px, 3.8vw, 34px);
	font-weight: 500;
	line-height: 1.2;
	margin: 0 auto 22px;
}
:global(html[data-vt="/>/live"]) .scene-title,
:global(html[data-vt$="/translate>/live"]) .scene-title {
	view-transition-name: hero-title;
}
:global(html[data-vt="/>/live"]) .region.scene > :global(.scene-card),
:global(html[data-vt$="/translate>/live"]) .region.scene > :global(.scene-card) {
	view-transition-name: card;
}
/* A scenario arrives on the sheet itself: what it came from (the translation's sheet, the box, the thread's end) grows
   into it. */
:global(html[data-vt$=">/live"]) .region.p1 > .sheet {
	view-transition-name: card;
}
/* Pass 2: the post above, the conversation below; two sibling panes, nothing overlaps. */
.region.p2 {
	overflow: hidden;
	padding: 12px 0 0;
	display: grid;
	grid-template-rows: minmax(0, 38%) minmax(0, 1fr);
	row-gap: 12px;
}
/* Wide screens are short on height, not width: post on the left, conversation on the right. */
@media (min-width: 980px) {
	.region.p2 {
		grid-template-rows: minmax(0, 1fr);
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		column-gap: 20px;
		row-gap: 0;
		padding: 14px max(24px, (100% - 1480px) / 2) 0;
	}
	.region.p2 > :global(*) {
		width: auto;
		margin: 0;
	}
	.region.p2 > .sheet {
		margin-bottom: 16px;
		padding: 16px 32px 0;
	}
}
.sheet {
	position: relative;
	background: var(--raised);
	border: 1px solid var(--edge);
	border-radius: 6px;
	padding: 26px 64px 48px;
	box-shadow: var(--paper-lift);
}
.sheet[hidden] {
	display: none;
}
.sheet-head {
	display: flex;
	align-items: center;
	gap: 14px;
	padding-bottom: 12px;
	margin-bottom: 20px;
	border-bottom: 1px solid var(--line-soft);
}
.sheet-meta {
	display: flex;
	gap: 8px;
	align-items: center;
	color: var(--muted);
	font-size: 13px;
}
.badge {
	display: inline-flex;
	align-items: center;
	height: 22px;
	padding: 0 8px;
	border-radius: 4px;
	border: 1px solid var(--line);
	font-size: 12px;
	color: var(--ink);
	white-space: nowrap;
}
.post-body {
	position: relative;
}
/* The end's retrieval is written from memory: the post is veiled until it is sent. */
.post-body > :global(.text) {
	transition:
		filter 250ms var(--ease-panel),
		opacity 250ms var(--ease-panel);
}
.post-body.veiled > :global(.text) {
	filter: blur(6px);
	opacity: 0.4;
	user-select: none;
}
/* In pass 2 the post is a pane: only the app moves it, and an edge fades where there is more. */
.region.p2 .sheet {
	display: flex;
	flex-direction: column;
	min-height: 0;
	padding: 12px 40px 0;
}
.region.p2 .sheet-head {
	flex: none;
	padding-bottom: 8px;
	margin-bottom: 0;
}
.region.p2 .post-body {
	flex: 1;
	min-height: 0;
	overflow: hidden;
	padding: 8px 8px 14px;
	margin-inline: -8px;
	--ft: 0px;
	--fb: 0px;
	mask-image: linear-gradient(transparent, #000 var(--ft), #000 calc(100% - var(--fb)), transparent);
}
.region.p2 .post-body:global(.above) {
	--ft: 26px;
}
.region.p2 .post-body:global(.below) {
	--fb: 30px;
}
.region.p2 .post-body :global(.text) {
	font-size: 15.5px;
	line-height: 1.7;
}
.region.p2 .post-body :global(.para) {
	margin-bottom: 0.55em;
}
/* While pass 1 is being written the draft waits in grey where it will stand, a light sweeping across it. */
.waiting-draft {
	font-size: 16.5px;
	line-height: 1.95;
	transition: opacity 0.45s ease;
}
.waiting-draft.leaving {
	opacity: 0;
}
.waiting-draft .para {
	margin: 0 0 1.1em;
	color: transparent;
	-webkit-text-fill-color: transparent;
	background-image: linear-gradient(
		90deg,
		var(--shimmer-base) 0%,
		var(--shimmer-base) 40%,
		var(--shimmer-highlight) 50%,
		var(--shimmer-base) 60%,
		var(--shimmer-base) 100%
	);
	background-size: 400% 100%;
	background-repeat: no-repeat;
	background-clip: text;
	animation: shimmer 2000ms linear infinite;
}
@keyframes shimmer {
	0% {
		background-position: 100% 0;
	}
	100% {
		background-position: 0% 0;
	}
}
.end {
	margin-top: 8px;
}
.col {
	flex-direction: column;
	align-items: flex-start;
	gap: 12px;
}
.stats {
	display: flex;
	gap: 22px;
	flex-wrap: wrap;
}
.stats b {
	display: block;
	font: 600 26px / 1.2 var(--font-serif-stack);
}
.stats span {
	color: var(--muted);
	font-size: 13px;
}
.go-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}
.postbox {
	align-self: stretch;
	padding: 12px 14px;
	border-radius: 6px;
	background: var(--well);
	font-size: 14.5px;
	white-space: pre-wrap;
}
.convo {
	display: flex;
	flex-direction: column;
	min-height: 0;
}
/* At the foot of the model calls' corner (debug/calls.css). Open, it stands over them. */
.dev {
	position: fixed;
	left: 14px;
	bottom: 14px;
	z-index: 30;
	font-size: 13px;
}
.dev > summary {
	list-style: none;
	display: inline-flex;
	align-items: center;
	height: 32px;
	padding: 0 12px;
	border-radius: 6px;
	border: 1px dashed var(--line);
	background: var(--raised);
	color: var(--muted);
	cursor: pointer;
	transition: opacity 0.2s ease;
}
.dev > summary::-webkit-details-marker {
	display: none;
}
.dev[open] {
	z-index: 85;
}
.dev-body {
	position: absolute;
	left: 0;
	bottom: 40px;
	padding: 12px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--raised);
	box-shadow: var(--pop);
	white-space: nowrap;
}
.phases {
	display: flex;
	gap: 6px;
}
.failure {
	margin-top: 4px;
}
.limits {
	display: grid;
	gap: 6px;
	margin-top: 12px;
	color: var(--muted);
}
.check {
	display: flex;
	align-items: center;
	gap: 6px;
	margin-top: 10px;
	color: var(--muted);
	cursor: pointer;
}
@media (max-width: 760px) {
	.session {
		--col: calc(100% - 24px);
	}
	.region {
		padding-top: 12px;
	}
	.region.p2 {
		padding-top: 8px;
		row-gap: 8px;
		grid-template-rows: minmax(0, 36%) minmax(0, 1fr);
	}
	.sheet {
		padding: 22px 20px 36px;
	}
	.region.p2 .sheet {
		padding: 10px 16px 0;
	}
	.region.p2 .sheet-head {
		display: none;
	}
}
@media (prefers-reduced-motion: reduce) {
	.waiting-draft .para {
		animation: none;
	}
}
</style>
