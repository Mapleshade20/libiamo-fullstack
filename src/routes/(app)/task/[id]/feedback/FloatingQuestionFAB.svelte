<script lang="ts">
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import Send from "@lucide/svelte/icons/send";
import X from "@lucide/svelte/icons/x";
import { tick } from "svelte";
import { fly, scale } from "svelte/transition";
import { deserialize } from "$app/forms";
import { Button } from "$lib/components/ui/button";
import { Skeleton } from "$lib/components/ui/skeleton";
import type { FeedbackConversation } from "$lib/feedback/types";
import { renderMarkdown } from "$lib/markdown";
import { dispatchQuotaNoticeFromData } from "$lib/quota-notices";

type AppendRequest = {
	id: number;
	text: string;
};

let {
	sessionId,
	conversation,
	appendRequest = null,
}: {
	sessionId: number;
	conversation: FeedbackConversation;
	appendRequest?: AppendRequest | null;
} = $props();

let isExpanded = $state(false);
let question = $state("");
let answer = $state<string | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);
let textareaElement = $state<HTMLTextAreaElement | null>(null);
let lastAppendRequestId = $state<number | null>(null);

$effect(() => {
	if (!appendRequest || appendRequest.id === lastAppendRequestId) return;
	lastAppendRequestId = appendRequest.id;
	void appendSelectedText(appendRequest.text);
});

async function appendSelectedText(text: string) {
	const trimmed = text.trim();
	if (!trimmed) return;
	isExpanded = true;
	answer = null;
	error = null;
	question = question.trim() ? `${question}\n\n${trimmed}` : trimmed;
	await tick();
	textareaElement?.focus();
}

function toggleExpanded() {
	isExpanded = !isExpanded;
	if (!isExpanded) {
		// Reset state when closing
		question = "";
		answer = null;
		error = null;
	}
}

async function handleSubmit() {
	if (!question.trim() || isLoading) return;

	isLoading = true;
	error = null;
	answer = null;

	try {
		// Build conversation context for the question
		const conversationText = conversation.allMessages.map((m) => `[${m.role === "user" ? "You" : m.author}] ${m.text}`).join("\n");

		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("itemText", conversationText.slice(0, 500)); // Truncate for context
		formData.append("category", "grammar");
		formData.append("question", question);

		const response = await fetch("?/followUp", {
			method: "POST",
			body: formData,
		});

		const result = deserialize(await response.text());
		dispatchQuotaNoticeFromData(result);

		if (result.type === "success" && result.data?.answer) {
			answer = result.data.answer as string;
		} else {
			error = "Failed to get answer";
		}
	} catch (e) {
		console.error("Failed to ask question:", e);
		error = "Network error";
	} finally {
		isLoading = false;
	}
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		void handleSubmit();
	}
}
</script>

{#if !isExpanded}
	<!-- FAB button -->
	<button
		type="button"
		data-selection-ignore
		class="fixed bottom-8 right-8 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#4a7c59] to-[#3d6849] text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
		onclick={toggleExpanded}
		transition:scale={{ duration: 200 }}
	>
		<MessageCircleQuestion size={24} />
	</button>
{:else}
	<!-- Expanded input panel -->
	<div
		data-selection-ignore
		class="fixed bottom-8 right-8 z-30 w-[400px] rounded-2xl border border-[#e8e3db] bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden"
		transition:fly={{ y: 20, duration: 300 }}
	>
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-[#e8e3db] p-4 bg-gradient-to-r from-[#4a7c59]/10 to-[#3d6849]/10">
			<div class="flex items-center gap-2">
				<MessageCircleQuestion size={20} class="text-[#4a7c59]" />
				<span class="font-medium text-[#2a2520]">Ask a Question</span>
			</div>
			<button type="button" class="rounded-md p-1 text-[#6b6560] hover:bg-[#e8e3db] transition-colors" onclick={toggleExpanded}>
				<X size={18} />
			</button>
		</div>

		<!-- Content -->
		<div class="p-4 max-h-[400px] overflow-y-auto">
			{#if answer || isLoading}
				<!-- User's question -->
				<div class="mb-4 rounded-lg bg-[#f5f2ed] p-3 border border-[#e8e3db]">
					<p class="text-xs font-bold text-[#9b8f85] mb-2 uppercase tracking-wider">Your Question</p>
					<p class="text-sm text-[#2a2520]">{question}</p>
				</div>
				<!-- Answer or loading -->
				<div class="rounded-lg bg-gradient-to-br from-[#4a7c59]/5 to-[#3d6849]/5 p-4 border border-[#4a7c59]/20">
					<p class="text-xs font-bold text-[#4a7c59] mb-2 uppercase tracking-wider">Answer</p>
					{#if isLoading}
						<div class="space-y-2">
							<Skeleton class="h-4 w-full" />
							<Skeleton class="h-4 w-5/6" />
							<Skeleton class="h-4 w-4/6" />
						</div>
					{:else if answer}
						<div class="prose prose-sm max-w-none text-[#2a2520]">{@html renderMarkdown(answer)}</div>
					{/if}
				</div>
				{#if answer}
					<Button
						size="sm"
						variant="ghost"
						class="mt-3 w-full"
						onclick={() => {
							answer = null;
							question = "";
							error = null;
						}}
					>
						Ask Another Question
					</Button>
				{/if}
			{:else if error}
				<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 mb-3">{error}</div>
			{:else}
				<p class="text-xs text-[#9b8f85] mb-3">Ask anything about your conversation, grammar, vocabulary, or the feedback you received.</p>
			{/if}
		</div>

		<!-- Input -->
		{#if !answer && !isLoading}
			<div class="border-t border-[#e8e3db] p-4 bg-[#fdfcf9]">
				<div class="flex items-end gap-2">
					<textarea
						bind:this={textareaElement}
						bind:value={question}
						onkeydown={handleKeydown}
						placeholder="Type your question..."
						class="flex-1 resize-none rounded-lg border border-[#e8e3db] bg-white px-3 py-2 text-sm text-[#2a2520] placeholder:text-[#9b8f85] focus:outline-none focus:ring-2 focus:ring-[#4a7c59]/20 focus:border-[#4a7c59]"
						rows="2"
					></textarea>
					<Button
						size="sm"
						onclick={handleSubmit}
						disabled={!question.trim() || isLoading}
						class="bg-gradient-to-br from-[#4a7c59] to-[#3d6849] hover:from-[#3d6849] hover:to-[#2f5237]"
					>
						<Send size={16} />
					</Button>
				</div>
			</div>
		{/if}
	</div>
{/if}
