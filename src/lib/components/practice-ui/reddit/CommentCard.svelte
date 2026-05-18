<script lang="ts">
import ArrowBigDown from "@lucide/svelte/icons/arrow-big-down";
import ArrowBigUp from "@lucide/svelte/icons/arrow-big-up";
import Gift from "@lucide/svelte/icons/gift";
import MessageSquare from "@lucide/svelte/icons/message-square";
import MoreHorizontal from "@lucide/svelte/icons/more-horizontal";
import Share2 from "@lucide/svelte/icons/share-2";
import MarkdownRenderer from "../../MarkdownRenderer.svelte";
import CommentEditor from "./CommentEditor.svelte";
import { formatVotes } from "./utils";

let {
	id,
	author,
	authorColor,
	text,
	timestamp,
	baseVotes,
	depth = 0,
	deliveryState = undefined as "sent" | "pending" | "failed" | undefined,
	disabled = false,
	userName = "",
	avatarUrl = "",
	avatarColor = "bg-[#FF4500]",
	t = {} as Record<string, string>,
	onRetry = undefined as ((id: string) => void) | undefined,
	onReply = undefined as ((text: string) => void) | undefined,
	onMockAction = () => {},
}: {
	id: string;
	author: string;
	authorColor: string;
	text: string;
	timestamp: string;
	baseVotes: number;
	depth?: number;
	deliveryState?: "sent" | "pending" | "failed";
	disabled?: boolean;
	userName?: string;
	avatarUrl?: string;
	avatarColor?: string;
	t?: Record<string, string>;
	onRetry?: (id: string) => void;
	onReply?: (text: string) => void;
	onMockAction?: () => void;
} = $props();

let vote = $state<"up" | "down" | null>(null);
let collapsed = $state(false);
let showReply = $state(false);

function toggleVote(dir: "up" | "down") {
	vote = vote === dir ? null : dir;
}

function toggleCollapse() {
	if (!collapsed) {
		showReply = false;
	}
	collapsed = !collapsed;
}

function handleReplySubmit(replyText: string) {
	if (onReply) {
		onReply(replyText);
	} else {
		onMockAction();
	}
	showReply = false;
}

const displayVotes = $derived(baseVotes + (vote === "up" ? 1 : vote === "down" ? -1 : 0));
const isPending = $derived(deliveryState === "pending");
const isFailed = $derived(deliveryState === "failed");
const replyPlaceholder = $derived((t.replyPlaceholder ?? "Reply to u/{author}").replace("{author}", author));
</script>

<div
	class="mb-1 overflow-hidden rounded-md border bg-white px-3 py-3 transition-colors {isFailed
		? 'border-red-200 bg-red-50'
		: 'border-[#EDEFF1] hover:border-[#898989]'}"
	style="margin-left: {Math.min(depth, 6) * 20}px"
>
	<div class="flex gap-2">
		<!-- Collapse column -->
		<div class="flex w-5 shrink-0 flex-col items-center">
			<button
				type="button"
				class="mb-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#EDEFF1] text-[10px] font-bold text-[#878A8C] transition-colors hover:border-[#FF4500] hover:text-[#FF4500]"
				onclick={toggleCollapse}
				aria-label="Toggle comment"
			>
				{collapsed ? "+" : "−"}
			</button>
			{#if !collapsed}
				<button
					type="button"
					class="w-[2px] flex-1 rounded-full bg-[#EDEFF1] transition-colors hover:bg-[#FF4500]"
					onclick={toggleCollapse}
					aria-label="Collapse thread"
				></button>
			{/if}
		</div>

		<!-- Comment body -->
		<div class="min-w-0 flex-1">
			<!-- Author row -->
			<div class="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
				<div class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full {authorColor} text-[9px] font-bold text-white">
					{author.charAt(0).toUpperCase()}
				</div>
				<button type="button" class="font-bold text-[#0079D3] hover:underline" onclick={onMockAction}>{author}</button>
				<span class="text-[#878A8C]">•</span>
				<span class="text-[#878A8C]">{timestamp}</span>
				{#if !isPending}
					<span class="font-bold text-[#878A8C]">{formatVotes(baseVotes)} {t.points}</span>
				{/if}
			</div>

			{#if !collapsed}
				<!-- Text / pending / failed -->
				{#if isPending}
					<div class="mb-2 flex items-center gap-1 py-1">
						<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]"></span>
						<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]" style="animation-delay: 0.15s"></span>
						<span class="h-2 w-2 animate-bounce rounded-full bg-[#878A8C]" style="animation-delay: 0.3s"></span>
					</div>
				{:else}
					<div
						class="mb-2 text-sm leading-6 {isFailed
							? 'text-red-500'
							: 'text-[#1C1C1C]'}"
					>
						<MarkdownRenderer content={text} />
					</div>
				{/if}

				<!-- Action row -->
				{#if !isPending}
					<div class="flex flex-wrap items-center gap-0.5 text-xs font-bold text-[#878A8C]">
						<button
							type="button"
							class="rounded p-1 transition-colors hover:bg-[#F6F7F8] {vote ===
							'up'
								? 'text-[#FF4500]'
								: ''}"
							onclick={() => toggleVote("up")}
							aria-label="Upvote"
						>
							<ArrowBigUp size={15} fill={vote === "up" ? "currentColor" : "none"} />
						</button>
						<span
							class="min-w-[2ch] px-0.5 text-center text-xs {vote ===
							'up'
								? 'text-[#FF4500]'
								: vote === 'down'
									? 'text-[#7193FF]'
									: 'text-[#1C1C1C]'}"
						>
							{formatVotes(displayVotes)}
						</span>
						<button
							type="button"
							class="rounded p-1 transition-colors hover:bg-[#F6F7F8] {vote ===
							'down'
								? 'text-[#7193FF]'
								: ''}"
							onclick={() => toggleVote("down")}
							aria-label="Downvote"
						>
							<ArrowBigDown size={15} fill={vote === "down" ? "currentColor" : "none"} />
						</button>
						<div class="mx-1 h-4 w-px bg-[#EDEFF1]"></div>
						<button
							type="button"
							class="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-[#F6F7F8] {showReply
								? 'bg-[#F6F7F8] text-[#0079D3]'
								: ''}"
							onclick={() => (showReply = !showReply)}
						>
							<MessageSquare size={12} />
							{t.reply}
						</button>
						<button type="button" class="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
							<Gift size={12} />
							{t.award}
						</button>
						<button type="button" class="flex items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
							<Share2 size={12} />
							{t.share}
						</button>
						<button type="button" class="rounded px-1.5 py-1 transition-colors hover:bg-[#F6F7F8]" onclick={onMockAction}>
							<MoreHorizontal size={14} />
						</button>
						{#if isFailed && onRetry}
							<button
								type="button"
								class="ml-1 rounded bg-red-100 px-2 py-1 text-red-600 transition-colors hover:bg-red-200"
								onclick={() => onRetry?.(id)}
							>
								{t.retry}
							</button>
						{/if}
					</div>
				{/if}

				<!-- Inline reply using unified CommentEditor -->
				{#if showReply}
					<div class="mt-2">
						<CommentEditor {disabled} {userName} {avatarUrl} {avatarColor} {t} placeholder={replyPlaceholder} onSubmit={handleReplySubmit} />
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
