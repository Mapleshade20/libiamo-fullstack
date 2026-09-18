<script lang="ts">
import MarkdownRenderer from "../../MarkdownRenderer.svelte";
import type { ChatMessage } from "../chatMessages";
import { getBubbleGroupPosition } from "./presentation";

let {
	messages,
	contactName,
	readLabel,
	deliveredLabel,
	lastOutgoingMessageId,
	lastOutgoingRead,
	retryLabel,
	onRetry,
}: {
	messages: ChatMessage[];
	contactName: string;
	readLabel: string;
	deliveredLabel: string;
	lastOutgoingMessageId: string | null;
	lastOutgoingRead: boolean;
	retryLabel: string;
	onRetry: (id: string) => void;
} = $props();
function classes(message: ChatMessage, index: number) {
	const position = getBubbleGroupPosition(messages, index);
	const user = message.role === "user";
	const color = user ? "bg-[#0A84FF] text-white md:bg-[#34C759]" : "bg-[#E5E5EA] text-[#1C1C1E] md:bg-[#ECECEF]";
	const radius =
		position === "start"
			? user
				? "rounded-[20px] rounded-br-md"
				: "rounded-[20px] rounded-bl-md"
			: position === "end"
				? user
					? "rounded-[20px] rounded-tr-md"
					: "rounded-[20px] rounded-tl-md"
				: position === "middle"
					? user
						? "rounded-[20px] rounded-tr-md rounded-br-md"
						: "rounded-[20px] rounded-tl-md rounded-bl-md"
					: "rounded-[20px]";
	return `${radius} ${color}`;
}
function showSender(index: number) {
	return messages[index]?.role === "agent" && messages[index - 1]?.role !== "agent";
}
</script>
{#each messages as message, index (message.id)}
	<div class="mb-1.5 flex flex-col {message.role === 'user' ? 'items-end' : 'items-start'}">
		{#if showSender(index)}
			<span class="mb-1 ml-2 hidden text-[11px] text-[#8E8E93] md:block">{contactName}</span>
		{/if}
		<div class="max-w-[82%] px-3 py-2 text-[15px] leading-5 shadow-sm md:max-w-[68%] {classes(message, index)}">
			<MarkdownRenderer content={message.text} />
		</div>
		{#if message.role === "agent" && message.deliveryState === "failed"}
			<button
				type="button"
				class="mt-1 ml-1 rounded-full border border-[#0A84FF] px-2 py-0.5 text-[11px] font-semibold text-[#0A84FF]"
				onclick={() => onRetry(message.id)}
			>
				{retryLabel}
			</button>
		{/if}
		{#if message.role === "user" && message.id === lastOutgoingMessageId}
			<span class="mt-1 mr-1 text-[11px] text-[#8E8E93]">{lastOutgoingRead ? readLabel : deliveredLabel}</span>
		{/if}
	</div>
{/each}
