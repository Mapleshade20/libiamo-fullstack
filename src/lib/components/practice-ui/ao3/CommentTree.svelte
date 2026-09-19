<script lang="ts">
import { base } from "$app/paths";
import MarkdownRenderer from "../../MarkdownRenderer.svelte";
import CommentTree from "./CommentTree.svelte";
import { type Ao3RenderableComment, DEFAULT_AO3_ICON } from "./helpers";

let {
	comment,
	chapterTitle,
	earlier,
	retryLabel,
	replyLabel,
	disabled,
	onRetry,
	onReply,
}: {
	comment: Ao3RenderableComment;
	chapterTitle: string;
	earlier: string;
	retryLabel: string;
	replyLabel: string;
	disabled: boolean;
	onRetry: (id: string) => void;
	onReply: (comment: Ao3RenderableComment) => void;
} = $props();
</script>

<li class="mb-4" style={`margin-left: ${Math.min(comment.depth, 5) * 2}%`}>
	<article class="rounded border border-[#ddd] bg-white shadow-sm">
		<div class="flex items-center justify-between border-b border-[#ddd] bg-[#eee] px-4 py-2 text-[13px]">
			<span><span class="ao3-comment-link">{comment.username}</span> on {comment.chapterTitle ?? chapterTitle}</span
			><span class="text-[#666]">{comment.timestamp ?? earlier}</span>
		</div>
		<div class="flex min-h-[100px] gap-4 p-4">
			<img
				class="h-[72px] w-[72px] shrink-0 border border-[#ccc] object-cover p-0.5 md:h-[100px] md:w-[100px]"
				alt=""
				src={comment.iconUrl || `${base}/${DEFAULT_AO3_ICON}`}
			>
			<div class="min-w-0 flex-1 break-words leading-6">
				<MarkdownRenderer content={comment.comment} />
				{#if comment.deliveryState === "failed" && comment.messageId}
					<button type="button" class="ao3-action mt-2" onclick={() => onRetry(comment.messageId ?? "")}>{retryLabel}</button>
				{/if}
			</div>
		</div>
		<ul class="m-0 flex list-none justify-end gap-2 border-t border-dotted border-[#ddd] bg-[#fdfdfd] px-4 py-2">
			<li>
				<button type="button" class="text-[#900] hover:border-b hover:border-dotted hover:border-[#900]" onclick={() => onReply(comment)} {disabled}>
					{replyLabel}
				</button>
			</li>
		</ul>
	</article>
	{#if comment.replies.length}
		<ol class="mt-4 list-none border-l border-[#ddd] pl-[3%]">
			{#each comment.replies as reply (reply.id)}
				<CommentTree comment={reply} {chapterTitle} {earlier} {retryLabel} {replyLabel} {disabled} {onRetry} {onReply} />
			{/each}
		</ol>
	{/if}
</li>
