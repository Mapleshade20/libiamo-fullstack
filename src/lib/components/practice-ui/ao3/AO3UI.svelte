<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import { onDestroy } from "svelte";
import { fade } from "svelte/transition";
import { base } from "$app/paths";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import FinishSessionSheet from "../FinishSessionSheet.svelte";
import { createHintController } from "../hint/controller.svelte";
import HintFloatingPanel from "../hint/HintFloatingPanel.svelte";
import { createPracticeSession } from "../session.svelte";
import TurnsLeftMobileBadge from "../TurnsLeftMobileBadge.svelte";
import type { PracticeUiRootProps } from "../types";
import { createAo3PresentationAdapter } from "./adapter";
import CommentTree from "./CommentTree.svelte";
import {
	type Ao3OpeningState,
	type Ao3RenderableComment,
	buildAo3CommentTree,
	countAo3Comments,
	getAo3AdditionalTags,
	getAo3AuthorName,
	normalizeAo3Text,
} from "./helpers";
import { i18n } from "./i18n";
import WorkMetadata from "./WorkMetadata.svelte";

let { taskId, userName, avatarUrl, language, existingSession, openingState, maxTurns, returnHref, feedbackHref }: PracticeUiRootProps = $props();

const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);
const sessionLabels = {
	get stillProcessingMessage() {
		return t.stillProcessingMessage;
	},
	get retryFailedMessage() {
		return t.retryFailedMessage;
	},
	get earlier() {
		return t.earlier;
	},
};

const adapter = createAo3PresentationAdapter();
const session = createPracticeSession(() => ({
	adapter,
	userName,
	avatarUrl,
	language,
	existingSession,
	openingState,
	maxTurns,
	feedbackHref,
	labels: sessionLabels,
}));

const opening = $derived((openingState ?? {}) as Ao3OpeningState);
const authorName = $derived(getAo3AuthorName(opening));
const workTitle = $derived(normalizeAo3Text(opening.workTitle, "Untitled Work"));
const chapterTitle = $derived(normalizeAo3Text(opening.chapterTitle, "Chapter 1"));
const summary = $derived(normalizeAo3Text(opening.summary));
const excerpt = $derived(normalizeAo3Text(opening.bodyExcerpt, "(Chapter text continues here...)"));
const rating = $derived(normalizeAo3Text(opening.rating, "Teen And Up Audiences"));
const warning = $derived(normalizeAo3Text(opening.archiveWarning, "No Archive Warnings Apply"));
const fandoms = $derived(opening.fandoms?.filter(Boolean) ?? ["Original Work"]);
const categories = $derived(opening.categories?.filter(Boolean) ?? []);
const relationships = $derived(opening.relationships?.filter(Boolean) ?? []);
const characters = $derived(opening.characters?.filter(Boolean) ?? []);
const additionalTags = $derived(getAo3AdditionalTags(opening));
const commentTree = $derived(
	buildAo3CommentTree({ openingState: opening, messages: session.messages, userAvatarUrl: avatarUrl, basePath: base, sessionId: session.sessionId }),
);
const commentCount = $derived(countAo3Comments(commentTree));
const characterLimit = PRACTICE_UI_TEXT_MAX_LENGTH;

let commentText = $state("");
let replyTarget = $state<Ao3RenderableComment | null>(null);
let hintLayoutReference = $state<HTMLDivElement | null>(null);
let showFinishConfirm = $state(false);
let scrollContainer: HTMLDivElement;
const disabled = $derived(session.disabled);

const hint = createHintController({
	getContext: () => ({
		sessionId: session.sessionId,
		language,
		draft: commentText,
		disabled,
		contextPath: replyTarget ? [{ author: replyTarget.username, text: replyTarget.comment }] : undefined,
	}),
});

const remainingCharacters = $derived(Math.max(0, characterLimit - commentText.length));
const formPlaceholder = $derived(session.isCompleted ? t.sessionEnded : session.limitReached ? t.turnLimitReached : t.leaveComment);

function scrollToForm() {
	setTimeout(() => document.getElementById("ao3-comment-form")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
}

function selectReplyTarget(comment: Ao3RenderableComment) {
	replyTarget = comment;
	scrollToForm();
}

function cancelReply() {
	replyTarget = null;
}

function submitComment() {
	const text = commentText.trim();
	if (!text || disabled) return;
	const target = replyTarget;
	const responderName = target?.username || authorName;
	const mode = target ? "reply" : "work";
	closeHintMenu();
	commentText = "";
	replyTarget = null;
	session.handleSend({
		message: text,
		extraFields: { threadTargetCommentId: target?.id ?? "" },
		messagePatches: {
			user: {
				thread: {
					commentId: "ao3-user-{clientMessageId}",
					targetCommentId: target?.id ?? null,
					responderName,
					mode,
				},
			},
			agent: {
				authorName: responderName,
				thread: {
					commentId: "ao3-agent-{clientMessageId}",
					parentCommentId: "ao3-user-{clientMessageId}",
					responderName,
					mode: "reply",
				},
			},
		},
	});
}

function handleTextareaKeydown(event: KeyboardEvent) {
	if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
		event.preventDefault();
		submitComment();
	}
}

function openHintMenu(trigger: HTMLElement) {
	hint.open(trigger);
}
function closeHintMenu() {
	hint.dismiss();
}
onDestroy(() => hint.destroy());

function handleWindowClick(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".ao3-hint-wrapper") && !target.closest(".hint-bubble") && hint.isOpen) closeHintMenu();
}

function scrollToTop() {
	scrollContainer?.scrollTo({ top: 0, behavior: "smooth" });
}

function handleFinishClick() {
	showFinishConfirm = true;
}

function handleFinishConfirm() {
	void session.handleCompleteAndNavigate();
}

function handleFinishCancel() {
	showFinishConfirm = false;
	session.clearCompletionError();
}
</script>

<svelte:window onclick={handleWindowClick} />

{#if session.isEntering}
	<div class="fixed inset-0 z-[3000] flex items-center justify-center bg-white/95" out:fade={{ duration: 150 }}>
		<div class="font-[Georgia,serif] text-2xl text-[#900]">Archive of Our Own</div>
	</div>
{/if}

<div bind:this={scrollContainer} class="fixed inset-0 z-[999] overflow-y-auto bg-white text-[#2a2a2a] ao3-root">
	<header class="flex items-center justify-between gap-3 border-b-[5px] border-black bg-[#900] px-[5%] py-2.5 text-white">
		<h1 class="m-0 min-w-0 font-[Georgia,serif] text-[1.25em] font-normal md:text-[1.5em]"><span class="ao3-site-title">Archive of Our Own</span></h1>
		<TurnsLeftMobileBadge
			remainingTurns={session.remainingTurns}
			isCompleted={session.isCompleted}
			label={t.turnsLeft}
			class="shrink-0 rounded border border-white/35 bg-white/10 px-2.5 py-1 text-sm font-bold text-white shadow-inner"
		/>
		<nav class="hidden md:block">
			<ul class="m-0 flex list-none gap-4 p-0 text-sm font-bold">
				<li><span>Hi, {userName}!</span></li>
				{#if session.remainingTurns !== null && !session.isCompleted}
					<li><span>{t.turnsLeft}: {session.remainingTurns}</span></li>
				{/if}
			</ul>
		</nav>
	</header>

	<div class="mx-auto w-[92%] max-w-[1200px] pt-6 pb-12">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<a href={returnHref || `${base}/task/${taskId}`} class="text-[#900] hover:border-b hover:border-dotted hover:border-[#900]">← {t.returnTask}</a>
			{#if !session.isCompleted && session.sessionId}
				<button
					type="button"
					class="rounded border border-[#ccc] bg-[#eee] px-3 py-1 text-sm text-[#444] shadow-inner hover:text-[#900] disabled:opacity-50"
					onclick={handleFinishClick}
					disabled={session.isCompleting || session.isSubmitting || session.isInitializing}
				>
					{session.isCompleting ? t.evaluating : t.finishTask}
				</button>
			{/if}
		</div>

		<WorkMetadata
			title={workTitle}
			author={authorName}
			{summary}
			{rating}
			{warning}
			{fandoms}
			{categories}
			{relationships}
			{characters}
			{additionalTags}
			{chapterTitle}
			{excerpt}
		/>

		<ul class="my-6 flex list-none flex-wrap justify-center gap-2 p-0">
			<li><button type="button" class="ao3-action" onclick={scrollToTop}>↑ Top</button></li>
			<li><button type="button" class="ao3-action">{t.kudos}</button></li>
			<li><button type="button" class="ao3-action">{t.bookmark}</button></li>
			<li><button type="button" class="ao3-action">{t.hideComments} ({commentCount})</button></li>
		</ul>

		<div class="mb-8 border-y border-[#eee] bg-[#f9f9f9] p-4">
			<p class="m-0"><span class="ao3-link">Licht_Yumi</span>, <span class="ao3-link">Silver3</span>, and many guests left kudos on this work!</p>
		</div>

		<section id="comments">
			<h3 class="mb-4 border-b border-[#ddd] pb-1 text-2xl font-normal">{t.comments}</h3>

			<div bind:this={hintLayoutReference} id="ao3-comment-form" class="mb-8 border border-[#ddd] bg-[#f3efec] p-4 shadow-inner">
				<div class="mb-2 flex items-start justify-between gap-3">
					<div>
						<h4 class="m-0 text-base font-normal">{t.commentAs} <strong>{userName}</strong></h4>
						{#if replyTarget}
							<p class="mt-1 text-sm text-[#666]">
								{t.replyTo} <strong>{replyTarget.username}</strong> ·
								<button type="button" class="text-[#900] underline" onclick={cancelReply}>{t.cancelReply}</button>
							</p>
						{/if}
					</div>
					<p class="m-0 text-xs">{t.plainText} <span class="ao3-link">?</span></p>
				</div>
				<textarea
					bind:value={commentText}
					maxlength={characterLimit}
					placeholder={formPlaceholder}
					class="box-border h-32 w-full border border-[#ccc] p-2 font-inherit disabled:opacity-50"
					onkeydown={handleTextareaKeydown}
					{disabled}
				></textarea>
				<div class="mt-2 flex items-center justify-between gap-3">
					<span class="text-xs">{remainingCharacters} {t.charactersLeft}</span>
					<div class="flex items-center gap-2">
						<div class="ao3-hint-wrapper relative">
							<button
								type="button"
								class="ao3-action inline-flex items-center gap-1 whitespace-nowrap"
								onclick={(event) => {
									event.stopPropagation();
								hint.isOpen ? closeHintMenu() : openHintMenu(event.currentTarget);
								}}
								disabled={!session.sessionId || disabled}
							>
								<Lightbulb size={14} class={hint.isLoading ? "animate-pulse text-[#900]" : ""} /> {t.getHint}
							</button>
						</div>
						<button type="button" class="ao3-action" onclick={submitComment} disabled={!commentText.trim() || disabled}>
							{replyTarget ? t.reply : t.comment}
						</button>
					</div>
				</div>
			</div>
			{#if hint.isOpen}
				<HintFloatingPanel
					anchorName="--libiamo-ao3-hint-anchor"
					layoutReference={hintLayoutReference}
					motionOrigin={hint.motionOrigin}
					{language}
					bind:expressionQuery={hint.expressionQuery}
					bind:activeMode={hint.mode}
					bind:submittedExpressionQuery={hint.submittedQuery}
					expressionPhrases={hint.phrases}
					contentHint={hint.contentHint}
					hintError={hint.error}
					isGettingHint={hint.isLoading}
					{disabled}
					onExpressionSubmit={hint.requestExpression}
					onContentHint={hint.requestContent}
					onReset={hint.reset}
					onClose={closeHintMenu}
				/>
			{/if}

			<ol class="m-0 list-none p-0">
				{#each commentTree as comment (comment.id)}
					<CommentTree
						{comment}
						{chapterTitle}
						earlier={t.earlier}
						retryLabel={t.retry}
						replyLabel={t.reply}
						{disabled}
						onRetry={(id) => session.handleRetry(id)}
						onReply={selectReplyTarget}
					/>
				{/each}
			</ol>
		</section>
	</div>
</div>

<FinishSessionSheet
	show={showFinishConfirm}
	{language}
	pending={session.isCompleting}
	error={session.completionError}
	onConfirm={handleFinishConfirm}
	onCancel={handleFinishCancel}
/>
<style>
.ao3-root {
	font-family: "Lucida Grande", "Lucida Sans Unicode", Verdana, Helvetica, sans-serif;
	font-size: 14px;
	line-height: 1.5;
}
.ao3-root :global(a:hover),
.ao3-root :global(a:focus) {
	border-bottom: 1px dotted #900;
}
.ao3-root :global(.ao3-link),
.ao3-root :global(.ao3-comment-link),
.ao3-root :global(.ao3-byline-link),
.ao3-root :global(.ao3-tag-link),
.ao3-root :global(.ao3-site-title) {
	display: inline;
	text-decoration: none;
}
.ao3-root :global(.ao3-link),
.ao3-root :global(.ao3-comment-link) {
	border-bottom: 1px solid currentColor;
	color: #111;
}
.ao3-root :global(.ao3-link:hover),
.ao3-root :global(.ao3-comment-link:hover),
.ao3-root :global(.ao3-byline-link:hover) {
	color: #999;
}
.ao3-root :global(.ao3-tag-link) {
	border-bottom: 1px dotted currentColor;
	color: #111;
	line-height: 1.5;
	padding: 0;
}
.ao3-root :global(.ao3-tag-link:hover) {
	border-color: #fff;
	background: #900;
	color: #fff;
}
.ao3-root :global(.ao3-commas li) {
	display: inline;
}
.ao3-root :global(.ao3-commas li::after) {
	content: ", ";
}
.ao3-root :global(.ao3-commas li:last-child::after),
.ao3-root :global(.ao3-commas li:only-child::after) {
	content: none;
}
.ao3-root :global(.ao3-byline-link) {
	border: 0;
	color: #111;
}
.ao3-root :global(.ao3-site-title) {
	border: 0;
	color: #fff;
}
.ao3-root :global(.ao3-site-title:hover) {
	border-bottom: 1px dotted currentColor;
}
.ao3-root :global(.ao3-action) {
	display: inline-block;
	border: 1px solid #ccc;
	border-radius: 4px;
	background: #eee;
	box-shadow: inset 0 -1px 2px rgba(0, 0, 0, 0.1);
	color: #444;
	cursor: pointer;
	font-family: inherit;
	font-size: 14px;
	padding: 0.35em 0.75em;
	text-decoration: none;
}
.ao3-root :global(.ao3-action:hover:not(:disabled)) {
	border-color: #bbb;
	background: #e0e0e0;
	box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.15);
	color: #900;
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
