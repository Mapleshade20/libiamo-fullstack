<script lang="ts">
import CheckCircle from "@lucide/svelte/icons/check-circle";
import MarkdownRenderer from "../../MarkdownRenderer.svelte";
import { normalizeEmojiTextForDisplay } from "../../utils/emojiUtils";
import { getTodayDateString } from "../../utils/messageUtils";
import type { ChatMessage } from "../chatMessages";
import type { ChatUser } from "./types";

let {
	chatContainer = $bindable(null as HTMLElement | null),
	messages = [] as ChatMessage[],
	isTyping = false,
	isInitializing = false,
	agentUser,
	limitReached = false,
	language = "en",
	emojiConv = null as any,
	retryLabel = "Retry",
	onRetry = (_id: string) => {},
}: {
	chatContainer?: HTMLElement | null;
	messages?: ChatMessage[];
	isTyping?: boolean;
	isInitializing?: boolean;
	agentUser: ChatUser;
	limitReached?: boolean;
	language?: string;
	emojiConv: any;
	retryLabel?: string;
	onRetry?: (id: string) => void;
} = $props();
</script>

<div bind:this={chatContainer} class="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
	<div class="my-4 mt-auto flex items-center justify-center">
		<div class="h-px flex-1 bg-[#404249]"></div>
		<span class="px-2 text-xs font-semibold text-[#949BA4]">{getTodayDateString(language)}</span>
		<div class="h-px flex-1 bg-[#404249]"></div>
	</div>

	{#each messages.filter((m) => !m.isHidden && m.deliveryState !== "pending") as msg (msg.id)}
		<div class="mt-4 flex hover:bg-[#2E3035] p-1 -mx-4 px-4 rounded group">
			<div
				class="mr-4 mt-0.5 h-10 w-10 shrink-0 rounded-full {msg.role ===
				'agent'
					? msg.avatarColor
					: 'bg-[#5865F2]'} flex items-center justify-center text-white font-bold overflow-hidden shadow-inner"
			>
				{#if msg.role === "user" && msg.avatar}
					<img src={msg.avatar} alt="User Avatar" class="h-full w-full object-cover">
				{:else}
					{msg.authorName.charAt(0).toUpperCase()}
				{/if}
			</div>
			<div class="flex-1 overflow-hidden">
				<div class="flex items-baseline gap-2">
					<span class="font-medium text-white hover:underline cursor-pointer">{msg.authorName}</span>
					<span class="text-xs text-[#949BA4]">{msg.timestamp}</span>
				</div>
				<div class="mt-0.5 text-[#DBDEE1] break-words leading-normal">
					{#if msg.role === "agent" && msg.deliveryState === "failed"}
						<div class="mt-1 flex flex-wrap items-center gap-2">
							<span class="text-[#F28B82] whitespace-pre-wrap">{emojiConv.replace_colons(msg.text)}</span>
							{#if !limitReached}
								<button
									type="button"
									class="flex items-center gap-2 rounded bg-[#DA373C] px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-[#B52D31]"
									onclick={() => onRetry(msg.id)}
								>
									<CheckCircle size={16} />{retryLabel}
								</button>
							{/if}
						</div>
					{:else if msg.role === "agent" && msg.deliveryState === "pending"}
						<div class="mt-1 flex flex-wrap items-center gap-2">
							<span class="text-[#F0B232] whitespace-pre-wrap">{emojiConv.replace_colons(msg.text)}</span>
							<button
								type="button"
								class="flex items-center gap-2 rounded bg-[#5865F2] px-3 py-1 text-sm font-medium text-white hover:bg-[#4752C4]"
								onclick={() => onRetry(msg.id)}
							>
								{retryLabel}
							</button>
						</div>
					{:else}
						<div class="markdown-wrapper">
							<MarkdownRenderer
								content={normalizeEmojiTextForDisplay(
									emojiConv.replace_colons(msg.text),
								)}
							/>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/each}

	{#if isTyping}
		<div class="mt-4 flex hover:bg-[#2E3035] p-1 -mx-4 px-4 rounded group items-center gap-3">
			<div class="mr-1 h-10 w-10 shrink-0 rounded-full {agentUser.color} flex items-center justify-center text-white font-bold overflow-hidden">
				{agentUser.name.charAt(0).toUpperCase()}
			</div>

			<div class="flex-1 flex items-center gap-3">
				<div class="flex gap-1">
					<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce"></span>
					<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce" style="animation-delay: 0.2s"></span>
					<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce" style="animation-delay: 0.4s"></span>
				</div>
				<span class="text-xs font-semibold text-[#80848E]">
					{isInitializing
						? "Agent is joining..."
						: `${agentUser.name} is typing...`}
				</span>
			</div>
		</div>
	{/if}
</div>
