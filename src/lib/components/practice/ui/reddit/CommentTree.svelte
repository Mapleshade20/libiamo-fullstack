<script lang="ts">
import ArrowBigDown from "@lucide/svelte/icons/arrow-big-down";
import ArrowBigUp from "@lucide/svelte/icons/arrow-big-up";
import Gift from "@lucide/svelte/icons/gift";
import MessageSquare from "@lucide/svelte/icons/message-square";
import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
import Share2 from "@lucide/svelte/icons/share-2";
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import type { ThreadComment } from "$lib/practice/comment-thread";
import CommentEditor from "./CommentEditor.svelte";
import CommentTree from "./CommentTree.svelte";
import { commentVotes, formatVotes, getAvatarColor } from "./format";
import type { RedditText } from "./i18n";

// Reddit's thread line colours cycle with depth.
const LINE_COLORS = ["#EDEFF1", "#FF4500", "#0079D3", "#46D0A6", "#FFB800", "#7193FF"];

let {
	comment,
	session,
	collapsed,
	ancestors,
	userName,
	avatarUrl,
	language,
	t,
	depth = 0,
	onReply,
	onMockAction,
}: {
	comment: ThreadComment;
	session: PracticeSession;
	/** Ids of collapsed comments, shared by the whole thread. */
	collapsed: Set<string>;
	/** The post and comments above this one, sent as hint context for replies. */
	ancestors: Array<{ author: string; text: string }>;
	userName: string;
	avatarUrl: string;
	language: LanguageCode;
	t: RedditText;
	depth?: number;
	onReply: (text: string, target: ThreadComment) => Promise<boolean>;
	onMockAction: () => void;
} = $props();

let replying = $state(false);
let vote = $state<"up" | "down" | null>(null);

const isCollapsed = $derived(collapsed.has(comment.id));
const path = $derived([...ancestors, { author: comment.author, text: comment.text }]);
const failed = $derived(comment.message?.deliveryState === "failed");
const isLearner = $derived(comment.message?.role === "user");
const baseVotes = $derived(commentVotes(comment));
const displayVotes = $derived(baseVotes + (vote === "up" ? 1 : vote === "down" ? -1 : 0));
</script>

<div class="comment-node">
	<div class="py-1">
		<div class="flex flex-wrap items-center gap-1 text-xs">
			{#if isLearner && avatarUrl}
				<img src={avatarUrl} alt="" class="h-5 w-5 shrink-0 rounded-full object-cover">
			{:else}
				<span
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white {getAvatarColor(comment.author)}"
					aria-hidden="true"
				>
					{comment.author.charAt(0).toUpperCase()}
				</span>
			{/if}
			<span class="font-bold text-[#0079D3]">{comment.author}</span>
			<span class="text-[#878A8C]" aria-hidden="true">•</span>
			<span class="text-[#878A8C]">{comment.timestamp || translate(language, "practice.earlier")}</span>
			<span class="font-bold text-[#878A8C]">{formatVotes(baseVotes)} {t.points}</span>
			<button
				type="button"
				class="min-h-8 rounded px-1 text-[#878A8C] transition-colors hover:bg-[#F6F7F8] hover:text-[#FF4500]"
				onclick={() => {
					if (isCollapsed) {
						collapsed.delete(comment.id);
					} else {
						collapsed.add(comment.id);
						replying = false;
					}
				}}
				aria-label={isCollapsed ? t.expand : t.collapse}
				aria-expanded={!isCollapsed}
			>
				[{isCollapsed ? "+" : "−"}]
			</button>
			{#if isCollapsed && comment.replies.length}
				<span class="text-[#878A8C]">{t.replyCount.replace("{count}", String(comment.replies.length))}</span>
			{/if}
		</div>

		{#if !isCollapsed}
			<div class="mb-1 pl-7 text-sm leading-6 {failed ? 'text-red-600' : 'text-[#1C1C1C]'}">
				{#if failed}
					{comment.message?.error || translate(language, "practice.replyFailed")}
				{:else}
					<MarkdownRenderer content={comment.text} />
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-0.5 pl-6 text-xs font-bold text-[#878A8C]">
				{#if failed && comment.message}
					{@const messageId = comment.message.id}
					<button
						type="button"
						class="min-h-11 rounded bg-red-100 px-3 text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 md:min-h-8"
						onclick={() => session.retry(messageId)}
						disabled={session.isSubmitting}
					>
						{translate(language, "practice.retry")}
					</button>
				{:else}
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded transition-colors hover:bg-[#F6F7F8] {vote === 'up' ? 'text-[#FF4500]' : ''}"
						onclick={() => (vote = vote === "up" ? null : "up")}
						aria-label={t.upvote}
						aria-pressed={vote === "up"}
					>
						<ArrowBigUp size={15} fill={vote === "up" ? "currentColor" : "none"} aria-hidden="true" />
					</button>
					<span class="min-w-[2ch] px-0.5 text-center {vote === 'up' ? 'text-[#FF4500]' : vote === 'down' ? 'text-[#7193FF]' : 'text-[#1C1C1C]'}">
						{formatVotes(displayVotes)}
					</span>
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded transition-colors hover:bg-[#F6F7F8] {vote === 'down' ? 'text-[#7193FF]' : ''}"
						onclick={() => (vote = vote === "down" ? null : "down")}
						aria-label={t.downvote}
						aria-pressed={vote === "down"}
					>
						<ArrowBigDown size={15} fill={vote === "down" ? "currentColor" : "none"} aria-hidden="true" />
					</button>
					<div class="mx-1 h-4 w-px bg-[#EDEFF1]"></div>
					<button
						type="button"
						class="flex min-h-11 items-center gap-1 rounded px-2 transition-colors hover:bg-[#F6F7F8] md:min-h-8 {replying ? 'bg-[#F6F7F8] text-[#0079D3]' : ''}"
						onclick={() => (replying = !replying)}
						aria-expanded={replying}
						disabled={session.disabled && !replying}
					>
						<MessageSquare size={12} aria-hidden="true" />
						{t.reply}
					</button>
					<button type="button" class="flex min-h-8 items-center gap-1 rounded px-2 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
						<Gift size={12} aria-hidden="true" />
						{t.award}
					</button>
					<button type="button" class="flex min-h-8 items-center gap-1 rounded px-2 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
						<Share2 size={12} aria-hidden="true" />
						{t.share}
					</button>
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded transition-colors hover:bg-[#F6F7F8]"
						onclick={onMockAction}
						aria-label={t.more}
					>
						<MoreHorizontal size={14} aria-hidden="true" />
					</button>
				{/if}
			</div>

			{#if replying}
				<div class="mt-1 pl-6">
					<CommentEditor
						{session}
						owner={`reply-${comment.id}`}
						placeholder={t.replyPlaceholder.replace("{author}", comment.author)}
						contextPath={path}
						{userName}
						{avatarUrl}
						{language}
						{t}
						startExpanded
						onSubmit={(text) => onReply(text, comment)}
						onCancel={() => (replying = false)}
					/>
				</div>
			{/if}
		{/if}
	</div>

	{#if !isCollapsed && comment.replies.length > 0}
		<div class="replies-wrapper" style:--thread-color={LINE_COLORS[(depth + 1) % LINE_COLORS.length]}>
			{#each comment.replies as reply (reply.id)}
				<CommentTree
					comment={reply}
					{session}
					{collapsed}
					ancestors={path}
					{userName}
					{avatarUrl}
					{language}
					{t}
					depth={depth + 1}
					{onReply}
					{onMockAction}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
/* The vertical thread line, with an L-shaped connector into each reply. */
.replies-wrapper {
	margin-left: 20px;
	padding-left: 16px;
	border-left: 2px solid var(--thread-color);
}
.replies-wrapper > :global(.comment-node) {
	position: relative;
}
.replies-wrapper > :global(.comment-node)::before {
	content: "";
	position: absolute;
	left: -16px;
	top: 0;
	width: 16px;
	height: 13px;
	border-left: 2px solid var(--thread-color);
	border-bottom: 2px solid var(--thread-color);
	border-bottom-left-radius: 8px;
}
</style>
