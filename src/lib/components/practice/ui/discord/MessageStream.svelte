<script lang="ts">
import Reply from "@lucide/svelte/icons/reply";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import { getTodayDateString, renderEmojiShortcodes } from "$lib/components/practice/session/message-format";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { getSceneMessageRef } from "$lib/practice/comment-thread";
import { memberColor } from "$lib/practice/discord-members";
import type { ChatMessage } from "$lib/practice/messages";
import { getDisplayClock } from "$lib/time/display-clock";
import { highlightMentions, mentionsName } from "./helpers";
import type { DiscordText } from "./i18n";

let {
	session,
	avatarUrl,
	userName,
	language,
	t,
	isTyping,
	mentionNames,
	replyingTo,
	onReply,
}: {
	session: PracticeSession;
	avatarUrl: string;
	userName: string;
	language: LanguageCode;
	t: DiscordText;
	isTyping: boolean;
	/** Everyone an `@` can name, the learner included. */
	mentionNames: string[];
	replyingTo: ChatMessage | null;
	onReply: (message: ChatMessage) => void;
} = $props();

const clock = getDisplayClock();
// Pending placeholders only drive polling; Discord shows the typing indicator instead.
const visibleMessages = $derived(session.messages.filter((message) => message.deliveryState !== "pending"));
const byRef = $derived(new Map(visibleMessages.map((message) => [getSceneMessageRef("discord", message), message])));
/** On touch screens a tap reveals a message's toolbar, as hovering does with a pointer. */
let tapped = $state<string | null>(null);
</script>

<div bind:this={session.scroller} class="flex-1 overflow-y-auto px-4 py-6 motion-safe:scroll-smooth">
	<div class="my-4 mt-auto flex items-center justify-center">
		<div class="h-px flex-1 bg-[#404249]"></div>
		<span class="px-2 text-xs font-semibold text-[#949BA4]">{getTodayDateString(language, clock())}</span>
		<div class="h-px flex-1 bg-[#404249]"></div>
	</div>

	{#each visibleMessages as message, index (message.id)}
		{@const previous = visibleMessages[index - 1]}
		{@const quoted = message.replyTo ? byRef.get(message.replyTo) : undefined}
		{@const grouped = !message.replyTo && previous?.role === message.role && previous.authorName === message.authorName}
		{@const pingsLearner = message.role === "agent" && mentionsName(message.text, userName)}
		{@const replyable = !message.deliveryState && !session.disabled}
		<div
			class="message-row group relative -mx-4 rounded px-4 py-1 {replyingTo?.id === message.id
				? 'bg-[#5865F2]/15 shadow-[inset_2px_0_0_#5865F2]'
				: pingsLearner
					? 'bg-[#F0B232]/10 shadow-[inset_2px_0_0_#F0B232] hover:bg-[#F0B232]/15'
					: 'hover:bg-[#2E3035]'}"
			class:mt-4={!grouped}
			class:mt-0.5={grouped}
			data-tapped={tapped === message.id || undefined}
			role="presentation"
			onclick={() => (tapped = message.id)}
		>
			{#if quoted}
				{@const [lead, trail] = t.quoted.split("{name}")}
				<div class="relative mb-1 flex min-w-0 items-center gap-1 pl-14 text-sm text-[#949BA4]">
					<span class="absolute top-1/2 left-[19px] h-3 w-8 rounded-tl-md border-t-2 border-l-2 border-[#4E5058]" aria-hidden="true"></span>
					<span class="sr-only">{lead}</span>
					<span
						class="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white {quoted.role === 'user'
							? 'bg-[#5865F2]'
							: memberColor(quoted.authorName)}"
						aria-hidden="true"
					>
						{quoted.authorName.charAt(0).toUpperCase()}
					</span>
					<span class="shrink-0 font-medium text-[#B5BAC1]">@{quoted.authorName}</span><span class="sr-only">{trail}</span>
					<span class="truncate">{quoted.text}</span>
				</div>
			{/if}
			<div class="flex">
				{#if grouped}
					<div class="mr-4 w-10 shrink-0 text-right text-[10px] text-[#949BA4] opacity-0 group-hover:opacity-100">{message.timestamp}</div>
				{:else}
					<div
						class="mt-0.5 mr-4 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white shadow-inner {message.role === 'user'
							? 'bg-[#5865F2]'
							: memberColor(message.authorName)}"
						aria-hidden="true"
					>
						{#if message.role === "user" && avatarUrl}
							<img src={avatarUrl} alt="" class="h-full w-full object-cover">
						{:else}
							{message.authorName.charAt(0).toUpperCase()}
						{/if}
					</div>
				{/if}
				<div class="flex-1 overflow-hidden">
					{#if !grouped}
						<div class="flex items-baseline gap-2">
							<span class="font-medium text-white">{message.authorName}</span>
							<span class="text-xs text-[#949BA4]">{message.timestamp || translate(language, "practice.earlier")}</span>
						</div>
					{/if}
					<div class="mt-0.5 leading-normal break-words text-[#DBDEE1]">
						{#if message.deliveryState === "failed"}
							<div class="mt-1 flex flex-wrap items-center gap-2">
								<span class="whitespace-pre-wrap text-[#F28B82]">{message.error || translate(language, "practice.replyFailed")}</span>
								{#if !session.limitReached}
									<button
										type="button"
										class="flex min-h-11 items-center gap-2 rounded bg-[#DA373C] px-3 text-sm font-medium text-white transition-colors hover:bg-[#B52D31] disabled:opacity-50 md:min-h-8"
										onclick={() => session.retry(message.id)}
										disabled={session.isSubmitting}
									>
										<RotateCcw size={16} aria-hidden="true" />{translate(language, "practice.retry")}
									</button>
								{/if}
							</div>
						{:else}
							<div class="markdown-wrapper"><MarkdownRenderer content={highlightMentions(renderEmojiShortcodes(message.text), mentionNames)} /></div>
						{/if}
					</div>
				</div>
			</div>
			{#if replyable}
				<div
					class="message-toolbar absolute -top-4 right-4 flex rounded-lg border border-[#26272B] bg-[#313338] p-0.5 shadow-[0_1px_4px_rgba(0,0,0,0.14)]"
				>
					<button
						type="button"
						class="grid h-11 w-11 place-items-center rounded text-[#B5BAC1] transition-colors hover:bg-[#3F4147] hover:text-[#DBDEE1] md:h-8 md:w-8"
						aria-label="{t.reply}: {message.authorName}"
						title={t.reply}
						onclick={(event) => {
							event.stopPropagation();
							tapped = null;
							onReply(message);
						}}
					>
						<Reply size={18} aria-hidden="true" />
					</button>
				</div>
			{/if}
		</div>
	{/each}

	{#if isTyping}
		<div class="mt-4 flex items-center gap-3" role="status">
			<div
				class="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white {memberColor(session.typingName)}"
				aria-hidden="true"
			>
				{session.typingName.charAt(0).toUpperCase()}
			</div>
			<div class="flex gap-1" aria-hidden="true">
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]"></span>
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]" style="animation-delay: 0.2s"></span>
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]" style="animation-delay: 0.4s"></span>
			</div>
			<span class="text-xs font-semibold text-[#80848E]">{t.typing.replace("{name}", session.typingName)}</span>
		</div>
	{/if}
</div>

<style>
.message-toolbar {
	opacity: 0;
	pointer-events: none;
	transition: opacity 100ms ease-out;
}
.message-row:hover .message-toolbar,
.message-row:focus-within .message-toolbar,
.message-row[data-tapped] .message-toolbar {
	opacity: 1;
	pointer-events: auto;
}
@media (prefers-reduced-motion: reduce) {
	.message-toolbar {
		transition: none;
	}
}
</style>
