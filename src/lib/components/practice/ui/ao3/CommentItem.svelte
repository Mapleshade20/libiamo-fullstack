<script lang="ts">
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { type ThreadComment, threadText } from "$lib/practice/comment-thread";
import CommentItem from "./CommentItem.svelte";
import { DEFAULT_AO3_ICON } from "./helpers";
import type { Ao3Text } from "./i18n";

let {
	comment,
	session,
	chapterTitle,
	avatarUrl,
	language,
	t,
	onReply,
}: {
	comment: ThreadComment;
	session: PracticeSession;
	chapterTitle: string;
	avatarUrl: string;
	language: LanguageCode;
	t: Ao3Text;
	onReply: (comment: ThreadComment) => void;
} = $props();

const message = $derived(comment.message);
const icon = $derived(
	comment.opening ? threadText(comment.opening.iconUrl, DEFAULT_AO3_ICON) : message?.role === "user" && avatarUrl ? avatarUrl : DEFAULT_AO3_ICON,
);
const failed = $derived(message?.deliveryState === "failed");
</script>

<li class="mb-4" style:margin-left="{Math.min(comment.depth, 5) * 2}%">
	<article class="rounded border border-[#ddd] bg-white shadow-sm">
		<div class="flex items-center justify-between gap-2 border-b border-[#ddd] bg-[#eee] px-4 py-2 text-[13px]">
			<span>
				<span class="border-b border-current text-[#111]">{comment.author}</span>
				on {threadText(comment.opening?.chapterTitle, chapterTitle)}
			</span>
			<span class="text-[#666]">{comment.timestamp || translate(language, "practice.earlier")}</span>
		</div>
		<div class="flex min-h-[100px] gap-4 p-4">
			<img class="h-[72px] w-[72px] shrink-0 border border-[#ccc] object-cover p-0.5 md:h-[100px] md:w-[100px]" alt="" src={icon}>
			<div class="min-w-0 flex-1 leading-6 break-words">
				{#if failed && message}
					<p class="text-[#900]">{message.error || translate(language, "practice.replyFailed")}</p>
					<button type="button" class="ao3-action mt-2" onclick={() => session.retry(message.id)} disabled={session.isSubmitting}>
						{translate(language, "practice.retry")}
					</button>
				{:else}
					<MarkdownRenderer content={comment.text} />
				{/if}
			</div>
		</div>
		{#if !failed}
			<div class="flex justify-end border-t border-dotted border-[#ddd] bg-[#fdfdfd] px-4 py-1">
				<button
					type="button"
					class="ao3-inline-link inline-flex min-h-11 items-center md:min-h-8"
					onclick={() => onReply(comment)}
					disabled={session.disabled}
				>
					{t.reply}
				</button>
			</div>
		{/if}
	</article>
	{#if comment.replies.length > 0}
		<ol class="mt-4 list-none border-l border-[#ddd] pl-[3%]">
			{#each comment.replies as reply (reply.id)}
				<CommentItem comment={reply} {session} {chapterTitle} {avatarUrl} {language} {t} {onReply} />
			{/each}
		</ol>
	{/if}
</li>
