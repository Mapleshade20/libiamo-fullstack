<script lang="ts">
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import { getTodayDateString, renderEmojiShortcodes } from "$lib/components/practice/session/message-format";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { getDisplayClock } from "$lib/time/display-clock";
import type { IMessageText } from "./i18n";
import { getBubbleCorners, getLastOutgoingMessageId, getRenderableMessages, isLastOutgoingMessageRead } from "./presentation";

let { session, language, t }: { session: PracticeSession; language: LanguageCode; t: IMessageText } = $props();

const clock = getDisplayClock();
const messages = $derived(getRenderableMessages(session.messages));
const lastOutgoingId = $derived(getLastOutgoingMessageId(messages));
const lastOutgoingRead = $derived(isLastOutgoingMessageRead(messages, session.agentReadUpToMessageId));
</script>

<div bind:this={session.scroller} class="flex-1 overflow-y-auto px-3 py-4 md:bg-[#F9F9FB] md:px-8 md:py-6">
	<div class="mb-4 flex items-center justify-center md:hidden">
		<div class="h-px flex-1 bg-[#E5E5EA]"></div>
		<span class="px-2 text-[11px] text-[#8E8E93]">{getTodayDateString(language, clock())}</span>
		<div class="h-px flex-1 bg-[#E5E5EA]"></div>
	</div>

	{#each messages as message, index (message.id)}
		{@const outgoing = message.role === "user"}
		<div class="mb-1.5 flex flex-col {outgoing ? 'items-end' : 'items-start'}">
			{#if !outgoing && messages[index - 1]?.role !== "agent"}
				<span class="mb-1 ml-2 hidden text-[11px] text-[#8E8E93] md:block">{message.authorName}</span>
			{/if}
			{#if message.deliveryState === "failed"}
				<p class="max-w-[82%] rounded-[20px] border border-[#FF3B30]/30 bg-[#FFF2F1] px-3 py-2 text-[15px] leading-5 text-[#C9281D] md:max-w-[68%]">
					{message.error || translate(language, "practice.replyFailed")}
				</p>
				<button
					type="button"
					class="mt-1 ml-1 min-h-11 rounded-full px-3 text-[13px] font-semibold text-[#0A84FF] hover:bg-[#EAF2FF] disabled:opacity-50 md:min-h-8"
					onclick={() => session.retry(message.id)}
					disabled={session.isSubmitting}
				>
					{translate(language, "practice.retry")}
				</button>
			{:else}
				<div
					class="max-w-[82%] rounded-[20px] px-3 py-2 text-[15px] leading-5 shadow-sm md:max-w-[68%] {getBubbleCorners(messages, index)} {outgoing
						? 'bg-[#0A84FF] text-white md:bg-[#34C759]'
						: 'bg-[#E5E5EA] text-[#1C1C1E] md:bg-[#ECECEF]'}"
				>
					<MarkdownRenderer content={renderEmojiShortcodes(message.text)} />
				</div>
			{/if}
			{#if outgoing && message.id === lastOutgoingId}
				<span class="mt-1 mr-1 text-[11px] text-[#8E8E93]">{lastOutgoingRead ? t.read : t.delivered}</span>
			{/if}
		</div>
	{/each}

	{#if (session.isTyping && lastOutgoingRead) || session.hasPendingReveals}
		<div class="mt-3 flex items-center" role="status">
			<div class="rounded-[18px] bg-[#E5E5EA] px-3 py-2" aria-hidden="true">
				<div class="flex gap-1">
					<span class="h-2 w-2 animate-bounce rounded-full bg-[#8E8E93]"></span>
					<span class="h-2 w-2 animate-bounce rounded-full bg-[#8E8E93]" style="animation-delay: 0.15s"></span>
					<span class="h-2 w-2 animate-bounce rounded-full bg-[#8E8E93]" style="animation-delay: 0.3s"></span>
				</div>
			</div>
			<span class="ml-2 text-[11px] text-[#8E8E93]">{t.typing}</span>
		</div>
	{/if}
</div>
