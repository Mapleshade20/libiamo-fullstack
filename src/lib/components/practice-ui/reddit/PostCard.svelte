<script lang="ts">
import ArrowBigDown from "@lucide/svelte/icons/arrow-big-down";
import ArrowBigUp from "@lucide/svelte/icons/arrow-big-up";
import Bookmark from "@lucide/svelte/icons/bookmark";
import ExternalLink from "@lucide/svelte/icons/external-link";
import Gift from "@lucide/svelte/icons/gift";
import MessageSquare from "@lucide/svelte/icons/message-square";
import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
import Share2 from "@lucide/svelte/icons/share-2";
import MarkdownRenderer from "../../MarkdownRenderer.svelte";
import type { RedditPost } from "./types";
import { formatVotes, getAvatarColor } from "./utils";

let {
	post,
	totalCommentCount = 0,
	t = {} as Record<string, string>,
	onMockAction = () => {},
}: {
	post: RedditPost;
	totalCommentCount?: number;
	t?: Record<string, string>;
	onMockAction?: () => void;
} = $props();

let vote = $state<"up" | "down" | null>(null);

function toggleVote(dir: "up" | "down") {
	vote = vote === dir ? null : dir;
}

const displayVotes = $derived((post.votes ?? 1) + (vote === "up" ? 1 : vote === "down" ? -1 : 0));
const subredditColor = $derived(getAvatarColor(post.subreddit));
</script>

<div class="mb-3 overflow-hidden rounded-md border border-[#CFDBD5] bg-white transition-colors hover:border-[#898989]">
	<div class="flex">
		<!-- Vote column -->
		<div class="flex w-10 shrink-0 flex-col items-center gap-0.5 rounded-l-md bg-[#F8F9FA] px-1 py-2">
			<button
				type="button"
				class="rounded p-0.5 transition-colors hover:bg-[#EDEFF1] {vote === 'up' ? 'text-[#FF4500]' : 'text-[#878A8C]'}"
				onclick={() => toggleVote("up")}
				aria-label="Upvote post"
			>
				<ArrowBigUp size={20} fill={vote === "up" ? "currentColor" : "none"} />
			</button>
			<span
				class="min-w-[2ch] text-center text-xs font-bold {vote === 'up' ? 'text-[#FF4500]' : vote === 'down' ? 'text-[#7193FF]' : 'text-[#1C1C1C]'}"
			>
				{formatVotes(displayVotes)}
			</span>
			<button
				type="button"
				class="rounded p-0.5 transition-colors hover:bg-[#EDEFF1] {vote === 'down' ? 'text-[#7193FF]' : 'text-[#878A8C]'}"
				onclick={() => toggleVote("down")}
				aria-label="Downvote post"
			>
				<ArrowBigDown size={20} fill={vote === "down" ? "currentColor" : "none"} />
			</button>
		</div>

		<!-- Post content -->
		<div class="min-w-0 flex-1 p-3">
			<!-- Subreddit meta row -->
			<div class="mb-2 flex flex-wrap items-center gap-1 text-xs text-[#878A8C]">
				<div class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full {subredditColor} text-[8px] font-bold text-white">
					{post.subreddit.charAt(0).toUpperCase()}
				</div>
				<button type="button" class="font-bold text-[#1C1C1C] hover:underline" onclick={onMockAction}>r/{post.subreddit}</button>
				<span>•</span>
				<span>{t.posted}</span>
				<button type="button" class="hover:underline" onclick={onMockAction}>u/{post.author}</button>
			</div>

			<!-- Title -->
			<h1 class="mb-2 text-lg font-medium leading-snug text-[#1C1C1C]">{post.title}</h1>

			<!-- Body -->
			{#if post.body}
				<div class="mb-3 text-sm leading-6 text-[#3C3C3C]"><MarkdownRenderer content={post.body} /></div>
			{/if}

			<!-- Action bar -->
			<div class="flex flex-wrap items-center gap-0.5 text-xs font-bold text-[#878A8C]">
				<button type="button" class="flex items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
					<MessageSquare size={14} />
					{totalCommentCount} {t.comments}
				</button>
				<button type="button" class="flex items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
					<Share2 size={14} />
					{t.share}
				</button>
				<button type="button" class="flex items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
					<Gift size={14} />
					{t.award}
				</button>
				<button type="button" class="flex items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
					<Bookmark size={14} />
					{t.save}
				</button>
				<button type="button" class="flex items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
					<ExternalLink size={14} />
				</button>
				<button type="button" class="flex items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
					<MoreHorizontal size={14} />
				</button>
			</div>
		</div>
	</div>
</div>
