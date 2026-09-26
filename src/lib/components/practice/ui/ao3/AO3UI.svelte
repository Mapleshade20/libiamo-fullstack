<script lang="ts">
import { tick } from "svelte";
import FinishSheet from "$lib/components/practice/session/FinishSheet.svelte";
import { createPracticeSession, type PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import UnavailableNotice from "$lib/components/practice/session/UnavailableNotice.svelte";
import TurnsLeftMobileBadge from "$lib/components/practice/TurnsLeftMobileBadge.svelte";
import { t as translate } from "$lib/i18n";
import { buildCommentThread, countComments, type ThreadComment } from "$lib/practice/comment-thread";
import CommentForm from "./CommentForm.svelte";
import CommentItem from "./CommentItem.svelte";
import { type Ao3OpeningState, describeWork } from "./helpers";
import { i18n } from "./i18n";
import WorkHeader from "./WorkHeader.svelte";

let props: PracticeSurfaceProps = $props();

const t = $derived(i18n[props.language] ?? i18n.en);
const work = $derived(describeWork((props.openingState ?? {}) as Ao3OpeningState));
const session = createPracticeSession(() => props, { fallbackAgentName: () => work.author });
const comments = $derived(buildCommentThread("ao3", props.openingState, session.messages));
const turnsLeft = $derived(translate(props.language, "practice.turnsLeft"));

let replyTarget = $state<ThreadComment | null>(null);
let form = $state<CommentForm>();
let notice = $state<UnavailableNotice>();
let root = $state<HTMLDivElement>();

async function replyTo(comment: ThreadComment) {
	replyTarget = comment;
	await tick();
	form?.focus();
}
</script>

<div bind:this={root} class="practice-surface ao3-root fixed inset-0 z-[999] overflow-y-auto bg-white text-[#2a2a2a]">
	<UnavailableNotice bind:this={notice} language={props.language} class="border border-[#ccc] bg-[#eee] text-[#2a2a2a]" />

	<header class="flex items-center justify-between gap-3 border-b-[5px] border-black bg-[#900] px-[5%] py-2.5 text-white">
		<p class="m-0 min-w-0 font-[Georgia,serif] text-[1.25em] md:text-[1.5em]">Archive of Our Own</p>
		<TurnsLeftMobileBadge
			remainingTurns={session.remainingTurns}
			isCompleted={session.isCompleted}
			label={turnsLeft}
			class="min-h-11 min-w-11 shrink-0 rounded border border-white/35 bg-white/10 px-2.5 text-sm font-bold text-white shadow-inner"
		/>
		<ul class="m-0 hidden list-none gap-4 p-0 text-sm font-bold md:flex">
			<li>Hi, {props.userName}!</li>
			{#if session.remainingTurns !== null && !session.isCompleted}
				<li>{turnsLeft}: {session.remainingTurns}</li>
			{/if}
		</ul>
	</header>

	<div class="mx-auto w-[92%] max-w-[1200px] pt-6 pb-12">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<a href={props.returnHref} class="ao3-inline-link inline-flex min-h-11 items-center">← {translate(props.language, "practice.returnToTask")}</a>
			{#if !session.isCompleted && session.sessionId}
				<button type="button" class="ao3-action" onclick={session.requestFinish} disabled={!session.canFinish}>
					{translate(props.language, session.isCompleting ? "practice.finishing" : "practice.finish")}
				</button>
			{/if}
		</div>

		<WorkHeader {work} />

		<ul class="my-6 flex list-none flex-wrap justify-center gap-2 p-0">
			<li><button type="button" class="ao3-action" onclick={() => root?.scrollTo({ top: 0 })}>{t.top}</button></li>
			<li><button type="button" class="ao3-action" onclick={() => notice?.show()}>{t.kudos}</button></li>
			<li><button type="button" class="ao3-action" onclick={() => notice?.show()}>{t.bookmark}</button></li>
			<li><button type="button" class="ao3-action" onclick={() => notice?.show()}>{t.hideComments} ({countComments(comments)})</button></li>
		</ul>

		<p class="mb-8 border-y border-[#eee] bg-[#f9f9f9] p-4">{t.kudosLeft.replace("{names}", "Licht_Yumi, Silver3")}</p>

		<section id="comments" aria-labelledby="ao3-comments-title">
			<h2 id="ao3-comments-title" class="mb-4 border-b border-[#ddd] pb-1 text-2xl font-normal">{t.comments}</h2>
			<CommentForm
				bind:this={form}
				bind:replyTarget
				{session}
				userName={props.userName}
				openingState={props.openingState}
				language={props.language}
				{t}
			/>
			<ol class="m-0 list-none p-0">
				{#each comments as comment (comment.id)}
					<CommentItem
						{comment}
						{session}
						chapterTitle={work.chapterTitle}
						avatarUrl={props.avatarUrl}
						language={props.language}
						{t}
						onReply={replyTo}
					/>
				{/each}
			</ol>
		</section>
	</div>

	<FinishSheet {session} language={props.language} />
</div>

<style>
.ao3-root {
	font-family: "Lucida Grande", "Lucida Sans Unicode", Verdana, Helvetica, sans-serif;
	font-size: 14px;
	line-height: 1.5;
}
.ao3-root :global(.ao3-inline-link) {
	color: #900;
	text-decoration: none;
}
.ao3-root :global(.ao3-inline-link:hover),
.ao3-root :global(.ao3-inline-link:focus-visible) {
	border-bottom: 1px dotted #900;
}
.ao3-root :global(.ao3-action) {
	display: inline-flex;
	min-height: 2.75rem;
	align-items: center;
	gap: 0.25rem;
	border: 1px solid #ccc;
	border-radius: 4px;
	background: #eee;
	box-shadow: inset 0 -1px 2px rgba(0, 0, 0, 0.1);
	color: #444;
	cursor: pointer;
	font-family: inherit;
	font-size: 14px;
	padding: 0 0.75em;
	white-space: nowrap;
}
@media (min-width: 768px) {
	.ao3-root :global(.ao3-action) {
		min-height: 2rem;
	}
}
.ao3-root :global(.ao3-action:hover:not(:disabled)) {
	border-color: #bbb;
	background: #e0e0e0;
	box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.15);
	color: #900;
}
.ao3-root :global(.ao3-action:focus-visible) {
	outline: 2px solid #900;
	outline-offset: 2px;
}
.ao3-root :global(.ao3-action:disabled) {
	cursor: not-allowed;
	opacity: 0.55;
}
.ao3-root :global(.markdown-wrapper p) {
	margin-top: 0;
	margin-bottom: 1em;
}
</style>
