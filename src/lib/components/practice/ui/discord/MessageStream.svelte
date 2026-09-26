<script lang="ts">
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import { getTodayDateString, renderEmojiShortcodes } from "$lib/components/practice/session/message-format";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { getDisplayClock } from "$lib/time/display-clock";
import type { DiscordText } from "./i18n";
import { type DiscordMember, memberColor } from "./members";

let {
	session,
	agent,
	avatarUrl,
	language,
	t,
	isTyping,
}: {
	session: PracticeSession;
	agent: DiscordMember;
	avatarUrl: string;
	language: LanguageCode;
	t: DiscordText;
	isTyping: boolean;
} = $props();

const clock = getDisplayClock();
// Pending placeholders only drive polling; Discord shows the typing indicator instead.
const visibleMessages = $derived(session.messages.filter((message) => message.deliveryState !== "pending"));
</script>

<div bind:this={session.scroller} class="flex-1 overflow-y-auto px-4 py-6 motion-safe:scroll-smooth">
	<div class="my-4 mt-auto flex items-center justify-center">
		<div class="h-px flex-1 bg-[#404249]"></div>
		<span class="px-2 text-xs font-semibold text-[#949BA4]">{getTodayDateString(language, clock())}</span>
		<div class="h-px flex-1 bg-[#404249]"></div>
	</div>

	{#each visibleMessages as message, index (message.id)}
		{@const previous = visibleMessages[index - 1]}
		{@const grouped = previous?.role === message.role && previous.authorName === message.authorName}
		<div class:mt-4={!grouped} class:mt-0.5={grouped} class="group -mx-4 flex rounded p-1 px-4 hover:bg-[#2E3035]">
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
						<div class="markdown-wrapper"><MarkdownRenderer content={renderEmojiShortcodes(message.text)} /></div>
					{/if}
				</div>
			</div>
		</div>
	{/each}

	{#if isTyping}
		<div class="mt-4 flex items-center gap-3" role="status">
			<div
				class="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white {memberColor(agent.name)}"
				aria-hidden="true"
			>
				{agent.name.charAt(0).toUpperCase()}
			</div>
			<div class="flex gap-1" aria-hidden="true">
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]"></span>
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]" style="animation-delay: 0.2s"></span>
				<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]" style="animation-delay: 0.4s"></span>
			</div>
			<span class="text-xs font-semibold text-[#80848E]">{t.typing.replace("{name}", agent.name)}</span>
		</div>
	{/if}
</div>
