<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import { onDestroy } from "svelte";
import { fade } from "svelte/transition";
import { BottomSheet } from "$lib/components/ui/bottom-sheet";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import MarkdownRenderer from "../../MarkdownRenderer.svelte";
import { requestHint } from "../hint/api";
import HintFloatingPanel from "../hint/HintFloatingPanel.svelte";
import { createHintRequestLifecycle } from "../hint/requestLifecycle";
import { createPracticeSession } from "../session.svelte";
import TurnsLeftMobileBadge from "../TurnsLeftMobileBadge.svelte";
import {
	type Ao3OpeningState,
	type Ao3RenderableComment,
	buildAo3CommentTree,
	countAo3Comments,
	DEFAULT_AO3_ICON,
	getAo3AdditionalTags,
	getAo3AuthorName,
	normalizeAo3Text,
} from "./helpers";
import { i18n } from "./i18n";

interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	existingSession?: any;
	openingState?: unknown;
	maxTurns?: number;
}

let {
	taskId = "",
	userName = "Learner",
	avatarUrl = "",
	language = "en",
	existingSession = null,
	openingState = null,
	maxTurns = 0,
}: Props = $props();

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

const session = createPracticeSession(() => ({
	userName,
	avatarUrl,
	language,
	existingSession,
	openingState,
	maxTurns,
	labels: sessionLabels,
	taskId,
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
const commentTree = $derived(buildAo3CommentTree({ openingState: opening, messages: session.messages, userAvatarUrl: avatarUrl }));
const commentCount = $derived(countAo3Comments(commentTree));
const characterLimit = PRACTICE_UI_TEXT_MAX_LENGTH;

let commentText = $state("");
let replyTarget = $state<Ao3RenderableComment | null>(null);
let showHintMenu = $state(false);
let showFinishConfirm = $state(false);
let contentHint = $state("");
let expressionQuery = $state("");
let expressionPhrases = $state<string[]>([]);
let hintError = $state<string | null>(null);
let isGettingHint = $state(false);
const hintRequests = createHintRequestLifecycle();
let hintLayoutReference = $state<HTMLDivElement | null>(null);
let hintMotionOrigin = $state<HTMLElement | null>(null);
let scrollContainer: HTMLDivElement;

const disabled = $derived(session.disabled);
const remainingCharacters = $derived(Math.max(0, characterLimit - commentText.length));
const formPlaceholder = $derived(session.isCompleted ? t.sessionEnded : session.limitReached ? t.turnLimitReached : t.leaveComment);

function tagList(values: string[]) {
	return values.filter(Boolean);
}

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
	session.handleSend(
		text,
		{ threadTargetCommentId: target?.id ?? "" },
		{
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
	);
}

function handleTextareaKeydown(event: KeyboardEvent) {
	if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
		event.preventDefault();
		submitComment();
	}
}

async function handleGetHint() {
	if (!session.sessionId || session.isCompleted || disabled || isGettingHint) return;
	const request = hintRequests.begin("content");
	isGettingHint = true;
	showHintMenu = true;
	contentHint = "";
	expressionPhrases = [];
	hintError = null;
	try {
		const contextPath = replyTarget ? [{ author: replyTarget.username, text: replyTarget.comment }] : undefined;
		const result = await requestHint({ sessionId: session.sessionId, mode: "content", draft: commentText, contextPath });
		if (!hintRequests.isCurrent(request) || !showHintMenu) return;
		contentHint = result.contentHint ?? "";
	} catch (err) {
		if (!hintRequests.isCurrent(request) || !showHintMenu) return;
		hintError = err instanceof Error && err.message.trim() ? err.message : "Failed to generate hints";
		console.error("Failed to get hints:", err);
	} finally {
		if (hintRequests.isCurrent(request)) isGettingHint = false;
		hintRequests.finish(request);
	}
}

async function handleExpressionHelp() {
	if (disabled || isGettingHint || !expressionQuery.trim()) return;
	const request = hintRequests.begin("expression");
	isGettingHint = true;
	showHintMenu = true;
	contentHint = "";
	expressionPhrases = [];
	hintError = null;
	try {
		if (!session.sessionId) return;
		const contextPath = replyTarget ? [{ author: replyTarget.username, text: replyTarget.comment }] : undefined;
		const result = await requestHint({
			sessionId: session.sessionId,
			mode: "expression",
			draft: commentText,
			expression: expressionQuery,
			contextPath,
		});
		if (!hintRequests.isCurrent(request) || !showHintMenu) return;
		expressionPhrases = result.phrases ?? [];
	} catch (err) {
		if (!hintRequests.isCurrent(request) || !showHintMenu) return;
		hintError = err instanceof Error && err.message.trim() ? err.message : "Failed to generate hints";
		console.error("Failed to get expression help:", err);
	} finally {
		if (hintRequests.isCurrent(request)) isGettingHint = false;
		hintRequests.finish(request);
	}
}

function openHintMenu(trigger: HTMLElement) {
	if (!session.sessionId || session.isCompleted || disabled) return;
	hintMotionOrigin = trigger;
	showHintMenu = true;
	hintError = null;
	contentHint = "";
	expressionPhrases = [];
}

function closeHintMenu() {
	hintRequests.invalidate();
	showHintMenu = false;
	hintError = null;
	isGettingHint = false;
	contentHint = "";
	expressionQuery = "";
	expressionPhrases = [];
}

onDestroy(() => hintRequests.invalidate());

function handleWindowClick(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".ao3-hint-wrapper") && !target.closest(".hint-bubble") && showHintMenu) closeHintMenu();
}

function scrollToTop() {
	scrollContainer?.scrollTo({ top: 0, behavior: "smooth" });
}

function handleFinishClick() {
	showFinishConfirm = true;
}

function handleFinishConfirm() {
	showFinishConfirm = false;
	void session.handleCompleteAndNavigate(String(taskId));
}

function handleFinishCancel() {
	showFinishConfirm = false;
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
			<a href={`/task/${taskId}`} class="text-[#900] hover:border-b hover:border-dotted hover:border-[#900]">← {t.returnTask}</a>
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

		<section class="mb-8 border border-[#ccc] bg-[#eee] p-2.5">
			<dl class="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1 md:grid-cols-[150px_1fr]">
				<dt class="pt-1 text-right font-bold">Rating:</dt>
				<dd class="border-b border-[#ddd] pb-1"><span class="ao3-tag-link">{rating}</span></dd>
				<dt class="pt-1 text-right font-bold">Archive Warning:</dt>
				<dd class="border-b border-[#ddd] pb-1"><span class="ao3-tag-link">{warning}</span></dd>
				{#if tagList(categories).length}
					<dt class="pt-1 text-right font-bold">Category:</dt>
					<dd class="border-b border-[#ddd] pb-1">{@render renderTagList(tagList(categories))}</dd>
				{/if}
				<dt class="pt-1 text-right font-bold">Fandoms:</dt>
				<dd class="border-b border-[#ddd] pb-1">{@render renderTagList(tagList(fandoms))}</dd>
				{#if tagList(relationships).length}
					<dt class="pt-1 text-right font-bold">Relationships:</dt>
					<dd class="border-b border-[#ddd] pb-1">{@render renderTagList(tagList(relationships))}</dd>
				{/if}
				{#if tagList(characters).length}
					<dt class="pt-1 text-right font-bold">Characters:</dt>
					<dd class="border-b border-[#ddd] pb-1">{@render renderTagList(tagList(characters))}</dd>
				{/if}
				{#if tagList(additionalTags).length}
					<dt class="pt-1 text-right font-bold">Additional Tags:</dt>
					<dd class="border-b border-[#ddd] pb-1">{@render renderTagList(tagList(additionalTags))}</dd>
				{/if}
			</dl>
		</section>

		<section class="mb-8 border-b border-[#ccc] pb-4 text-center">
			<h2 class="m-0 font-[Georgia,serif] text-3xl">{workTitle}</h2>
			<h3 class="m-0 mt-1 text-lg font-normal"><span class="ao3-byline-link">{authorName}</span></h3>
			{#if summary}
				<div class="mx-auto mt-4 max-w-[800px] border border-[#ccc] bg-[#fdfdfd] p-4 text-left">
					<p class="font-bold">Summary:</p>
					<blockquote class="m-0"><MarkdownRenderer content={summary} /></blockquote>
				</div>
			{/if}
		</section>

		<section class="min-h-[220px] py-4 text-[15px]">
			<h3 class="mb-4 text-center font-[Georgia,serif] text-xl font-normal">{chapterTitle}</h3>
			<div class="mx-auto max-w-3xl leading-6"><MarkdownRenderer content={excerpt} /></div>
		</section>

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
									showHintMenu ? closeHintMenu() : openHintMenu(event.currentTarget);
								}}
								disabled={!session.sessionId || disabled}
							>
								<Lightbulb size={14} class={isGettingHint ? "animate-pulse text-[#900]" : ""} /> {t.getHint}
							</button>
						</div>
						<button type="button" class="ao3-action" onclick={submitComment} disabled={!commentText.trim() || disabled}>
							{replyTarget ? t.reply : t.comment}
						</button>
					</div>
				</div>
			</div>
			{#if showHintMenu}
				<HintFloatingPanel
					anchorName="--libiamo-ao3-hint-anchor"
					layoutReference={hintLayoutReference}
					motionOrigin={hintMotionOrigin}
					{language}
					bind:expressionQuery
					{expressionPhrases}
					{contentHint}
					{hintError}
					{isGettingHint}
					{disabled}
					onExpressionSubmit={handleExpressionHelp}
					onContentHint={handleGetHint}
					onClose={closeHintMenu}
				/>
			{/if}

			<ol class="m-0 list-none p-0">
				{#each commentTree as comment (comment.id)}
					{@render renderComment(comment)}
				{/each}
			</ol>
		</section>
	</div>
</div>

<BottomSheet
	show={showFinishConfirm}
	title="Finish Task"
	message="Are you ready to finish this task and see your feedback? You won't be able to send more messages after confirming."
	confirmLabel="Finish & Review"
	cancelLabel="Keep Practicing"
	onConfirm={handleFinishConfirm}
	onCancel={handleFinishCancel}
/>

{#snippet renderTagList(values: string[])}
	<ul class="ao3-commas m-0 list-none p-0">
		{#each values as value}
			<li><span class="ao3-tag-link">{value}</span></li>
		{/each}
	</ul>
{/snippet}

{#snippet renderComment(comment: Ao3RenderableComment)}
	<li class="mb-4" style={`margin-left: ${Math.min(comment.depth, 5) * 2}%`}>
		<article class="rounded border border-[#ddd] bg-white shadow-sm">
			<div class="flex items-center justify-between border-b border-[#ddd] bg-[#eee] px-4 py-2 text-[13px]">
				<span
					><span class="ao3-comment-link">{comment.username}</span>
					on {comment.chapterTitle ?? chapterTitle}</span
				>
				<span class="text-[#666]">{comment.timestamp ?? t.earlier}</span>
			</div>
			<div class="flex min-h-[100px] gap-4 p-4">
				<img
					class="h-[72px] w-[72px] shrink-0 border border-[#ccc] object-cover p-0.5 md:h-[100px] md:w-[100px]"
					alt=""
					src={comment.iconUrl || DEFAULT_AO3_ICON}
				>
				<div class="min-w-0 flex-1 break-words leading-6">
					<MarkdownRenderer content={comment.comment} />
					{#if comment.deliveryState === "failed" && comment.messageId}
						<button type="button" class="ao3-action mt-2" onclick={() => session.handleRetry(comment.messageId ?? "")}>{t.retry}</button>
					{/if}
				</div>
			</div>
			<ul class="m-0 flex list-none justify-end gap-2 border-t border-dotted border-[#ddd] bg-[#fdfdfd] px-4 py-2">
				<li>
					<button
						type="button"
						class="text-[#900] hover:border-b hover:border-dotted hover:border-[#900]"
						onclick={() => selectReplyTarget(comment)}
						{disabled}
					>
						{t.reply}
					</button>
				</li>
			</ul>
		</article>
		{#if comment.replies.length > 0}
			<ol class="mt-4 list-none border-l border-[#ddd] pl-[3%]">
				{#each comment.replies as reply (reply.id)}
					{@render renderComment(reply)}
				{/each}
			</ol>
		{/if}
	</li>
{/snippet}

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
.ao3-link,
.ao3-comment-link,
.ao3-byline-link,
.ao3-tag-link,
.ao3-site-title {
	display: inline;
	text-decoration: none;
}
.ao3-link,
.ao3-comment-link {
	border-bottom: 1px solid currentColor;
	color: #111;
}
.ao3-link:hover,
.ao3-comment-link:hover,
.ao3-byline-link:hover {
	color: #999;
}
.ao3-tag-link {
	border-bottom: 1px dotted currentColor;
	color: #111;
	line-height: 1.5;
	padding: 0;
}
.ao3-tag-link:hover {
	border-color: #fff;
	background: #900;
	color: #fff;
}
.ao3-commas li {
	display: inline;
}
.ao3-commas li::after {
	content: ", ";
}
.ao3-commas li:last-child::after,
.ao3-commas li:only-child::after {
	content: none;
}
.ao3-byline-link {
	border: 0;
	color: #111;
}
.ao3-site-title {
	border: 0;
	color: #fff;
}
.ao3-site-title:hover {
	border-bottom: 1px dotted currentColor;
}
.ao3-action {
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
.ao3-action:hover:not(:disabled) {
	border-color: #bbb;
	background: #e0e0e0;
	box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.15);
	color: #900;
}
.ao3-action:disabled {
	cursor: not-allowed;
	opacity: 0.55;
}
.ao3-root :global(.markdown-wrapper p) {
	margin-top: 0;
	margin-bottom: 1em;
}
</style>
