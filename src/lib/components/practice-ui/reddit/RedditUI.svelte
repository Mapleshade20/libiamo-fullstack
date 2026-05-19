<script lang="ts">
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Search from "@lucide/svelte/icons/search";
import { fade } from "svelte/transition";
import { createPracticeSession } from "../session.svelte";
import CommentEditor from "./CommentEditor.svelte";
import CommentTree from "./CommentTree.svelte";
import CommunityPanel from "./CommunityPanel.svelte";
import Header from "./Header.svelte";
import { buildRedditCommentTree, countRedditComments, getRedditCommentVotes, type RedditRenderableComment } from "./helpers";
import { i18n } from "./i18n";
import Overlays from "./Overlays.svelte";
import PostCard from "./PostCard.svelte";
import Sidebar from "./Sidebar.svelte";
import type { CommentTreeNode, ContextComment, RedditOpeningState } from "./types";
import { getAvatarColor } from "./utils";

interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	existingSession?: any;
	openingState?: unknown;
	maxTurns?: number;
	agentStartsFirst?: boolean;
}

let {
	taskId = "",
	userName = "Learner",
	avatarUrl = "",
	language = "en",
	existingSession = null,
	openingState = null,
	maxTurns = 0,
	agentStartsFirst = true,
}: Props = $props();

const t = $derived(i18n[language as keyof typeof i18n] ?? i18n.en);

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
	agentStartsFirst,
	labels: sessionLabels,
	joinTriggerText: "*User joined the server*",
	isHiddenCheck: (m) => m.content === "*User joined the server*",
}));

// ── Opening state ────────────────────────────────────────────────────

const typedState = $derived((openingState ?? {}) as RedditOpeningState);
const post = $derived({
	title: typedState.post?.title || "Untitled Post",
	body: typedState.post?.body || "",
	subreddit: typedState.post?.subreddit || "AskReddit",
	author: typedState.post?.author || "unknown",
	votes: typedState.post?.votes ?? 1,
});
const visibleMessages = $derived(session.messages.filter((message) => message.deliveryState !== "pending"));
const renderableCommentTree = $derived(buildRedditCommentTree({ openingState: typedState, messages: visibleMessages }));

// Top-level input text (separate from inline reply inputs which manage their own state)
let topLevelInput = $state("");

// Global disabled: all editors locked while agent is generating
const allDisabled = $derived(session.disabled);

const userAvatarColor = $derived(getAvatarColor(userName));

function findRenderableComment(comments: RedditRenderableComment[], id: string): RedditRenderableComment | null {
	for (const comment of comments) {
		if (comment.id === id) return comment;
		const child = findRenderableComment(comment.replies, id);
		if (child) return child;
	}
	return null;
}

function sendComment(text: string, targetId: string | null) {
	const trimmed = text.trim();
	if (!trimmed || allDisabled) return;
	const target = targetId ? findRenderableComment(renderableCommentTree, targetId) : null;
	const responderName = target?.author || post.author;
	const mode = target ? "reply" : "post";
	session.handleSend(
		trimmed,
		{ threadTargetCommentId: target?.id ?? "" },
		{
			user: {
				thread: {
					commentId: "reddit-user-{clientMessageId}",
					targetCommentId: target?.id ?? null,
					responderName,
					mode,
				},
			},
			agent: {
				authorName: responderName,
				thread: {
					commentId: "reddit-agent-{clientMessageId}",
					parentCommentId: "reddit-user-{clientMessageId}",
					responderName,
					mode: "reply",
				},
			},
		},
	);
}

// ── Handle top-level comment submit ──────────────────────────────────

function handleTopLevelSubmit(text: string) {
	sendComment(text, null);
}

// ── Handle inline reply submit ───────────────────────────────────────

function handleReplyToComment(text: string, parentId: string) {
	sendComment(text, parentId);
}

// ── Build comment tree ───────────────────────────────────────────────

function toTreeNode(comment: RedditRenderableComment): CommentTreeNode {
	const messageId = comment.messageId;
	return {
		id: comment.id,
		author: comment.author,
		authorColor: comment.role === "agent" ? session.agentUser.color : comment.role === "user" ? userAvatarColor : getAvatarColor(comment.author),
		authorAvatarUrl: comment.role === "user" ? avatarUrl : undefined,
		text: comment.text,
		timestamp: comment.timestamp ?? t.earlier,
		baseVotes: getRedditCommentVotes(comment, comment.id, comment.role === "user" ? 1 : 10, comment.role === "user" ? 60 : 800),
		depth: comment.depth,
		children: comment.replies.map(toTreeNode),
		parentId: comment.parentId,
		deliveryState: comment.deliveryState,
		role: comment.role,
		onRetry: comment.role === "agent" && messageId ? () => session.handleRetry(messageId) : undefined,
		onReply: handleReplyToComment,
	};
}

const commentTree = $derived(renderableCommentTree.map(toTreeNode));

// Post context for hint generation: post author + body as root ancestor
const postContext = $derived<ContextComment[]>([{ author: post.author, text: post.body || post.title }]);

const totalCommentCount = $derived(countRedditComments(renderableCommentTree));

// ── Toast for mock actions ───────────────────────────────────────────

let showToast = $state(false);
let toastTimer: ReturnType<typeof setTimeout>;

function handleMockAction() {
	showToast = true;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		showToast = false;
	}, 2500);
}

// ── Mobile sidebar ───────────────────────────────────────────────────

let showMobileMenu = $state(false);
</script>

<!--===================================================-->

{#if session.isEntering}
	<div class="fixed inset-0 z-[3000] flex items-center justify-center bg-white" out:fade={{ duration: 200 }}>
		<div class="flex flex-col items-center gap-4">
			<div class="flex h-16 w-16 items-center justify-center drop-shadow-lg">
				<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="h-full w-full" role="img" aria-label="Reddit">
					<ellipse cx="22" cy="58" rx="10" ry="12" fill="white" />
					<ellipse cx="78" cy="58" rx="10" ry="12" fill="white" />
					<circle cx="50" cy="59" r="33" fill="white" />
					<rect x="47" y="18" width="6" height="22" rx="3" fill="white" />
					<circle cx="50" cy="13" r="9" fill="white" />
					<circle cx="36" cy="53" r="10" fill="#FF4500" />
					<circle cx="64" cy="53" r="10" fill="#FF4500" />
					<circle cx="39" cy="51" r="5" fill="white" />
					<circle cx="67" cy="51" r="5" fill="white" />
					<ellipse cx="50" cy="69" rx="9" ry="6" fill="#FF4500" />
				</svg>
			</div>
			<div class="flex items-center gap-1.5">
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#FF4500]"></span>
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#FF4500]" style="animation-delay: 0.15s"></span>
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#FF4500]" style="animation-delay: 0.3s"></span>
			</div>
		</div>
	</div>
{/if}

<div class="fixed inset-0 z-[999] flex flex-col bg-white font-sans text-[#1C1C1C]">
	<!-- Header -->
	<Header
		{t}
		remainingTurns={session.remainingTurns}
		isCompleted={session.isCompleted}
		sessionId={session.sessionId}
		isCompleting={session.isCompleting}
		isSubmitting={session.isSubmitting}
		isInitializing={session.isInitializing}
		onComplete={session.handleComplete}
		onMockAction={handleMockAction}
		onToggleMobileMenu={() => (showMobileMenu = !showMobileMenu)}
	/>

	<!-- Body row -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Left sidebar -->
		<Sidebar
			{t}
			{taskId}
			subreddit={post.subreddit}
			{userName}
			{avatarUrl}
			{showMobileMenu}
			onCloseMobileMenu={() => (showMobileMenu = false)}
			onMockAction={handleMockAction}
		/>

		<!-- Main content + right panel -->
		<div class="flex flex-1 overflow-hidden">
			<!-- Scrollable feed -->
			<main class="flex flex-1 flex-col overflow-hidden">
				<div bind:this={session.chatContainer} class="flex-1 overflow-y-auto">
					<div class="mx-auto max-w-[740px] px-2 py-3 md:px-3">
						<!-- Post card -->
						<PostCard {post} {totalCommentCount} {t} onMockAction={handleMockAction} />

						<!-- Top-level comment editor (unified component) -->
						<div class="mb-3">
							<CommentEditor
								bind:inputText={topLevelInput}
								disabled={allDisabled}
								placeholder="What are your thoughts?"
								{userName}
								{avatarUrl}
								avatarColor={userAvatarColor}
								{t}
								sessionId={session.sessionId}
								contextPath={postContext}
								onSubmit={handleTopLevelSubmit}
							/>
						</div>

						<!-- Sort bar -->
						<div class="mb-3 flex items-center gap-2 rounded-md border border-[#CFDBD5] bg-white px-3 py-2">
							<button
								type="button"
								class="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold text-[#1C1C1C] transition-colors hover:bg-[#F6F7F8]"
								onclick={handleMockAction}
							>
								{t.sortBest}
								<ChevronDown size={14} />
							</button>
							<div class="flex-1"></div>
							<button
								type="button"
								class="flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-bold text-[#878A8C] transition-colors hover:bg-[#F6F7F8]"
								onclick={handleMockAction}
							>
								<Search size={12} />
								{t.searchComments}
							</button>
						</div>

						<!-- Comment tree -->
						{#each commentTree as rootNode (rootNode.id)}
							<CommentTree
								node={rootNode}
								ancestorPath={postContext}
								disabled={allDisabled}
								{userName}
								{avatarUrl}
								avatarColor={userAvatarColor}
								agentColor={session.agentUser.color}
								agentName={session.agentName}
								sessionId={session.sessionId}
								{t}
								onMockAction={handleMockAction}
							/>
						{/each}

						<div class="h-2"></div>
					</div>
				</div>
			</main>

			<CommunityPanel subreddit={post.subreddit} {t} />
		</div>
	</div>
</div>

<!-- Overlays (toast + evaluation modal) -->
<Overlays
	{showToast}
	showEvaluationModal={session.showEvaluationModal}
	feedback={session.feedback}
	{taskId}
	{t}
	onCloseEvaluation={() => (session.showEvaluationModal = false)}
/>

<style>
::-webkit-scrollbar {
	width: 6px;
	height: 6px;
}
::-webkit-scrollbar-thumb {
	background: #ccc;
	border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
	background: #aaa;
}
:global(.markdown-wrapper p) {
	margin: 0;
	display: inline;
}
</style>
