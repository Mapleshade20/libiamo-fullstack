<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import { fade, fly } from "svelte/transition";
import { enhance } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { Button } from "$lib/components/ui/button";
import { Skeleton } from "$lib/components/ui/skeleton";
import type { AnnotationSpan, FeedbackMessage, FeedbackResult, MessageAnnotation } from "$lib/feedback-types";
import { cn } from "$lib/utils";
import AnnotatedMessage from "./AnnotatedMessage.svelte";
import AnnotationPopup from "./AnnotationPopup.svelte";
import FloatingQuestionFAB from "./FloatingQuestionFAB.svelte";

let { data } = $props();

let feedback = $state<FeedbackResult | null>(null);
let isGenerating = $state(false);
let generationError = $state<string | null>(null);
let activeAnnotation = $state<{
	span: AnnotationSpan;
	messageId: number;
	rect: DOMRect;
} | null>(null);

// Initialize feedback from data
$effect(() => {
	if (data.existingFeedback && !feedback) {
		feedback = data.existingFeedback;
	}
});

// Trigger generation if not already done
$effect(() => {
	if (!feedback && !isGenerating && !generationError) {
		void triggerGeneration();
	}
});

async function triggerGeneration() {
	isGenerating = true;
	generationError = null;

	try {
		const formData = new FormData();
		const response = await fetch("?/generateFeedback", {
			method: "POST",
			body: formData,
		});

		const result = await response.json();

		if (result.type === "success" && result.data?.feedback) {
			feedback = result.data.feedback as FeedbackResult;
			await invalidateAll();
		} else {
			generationError = result.data?.error ?? "Failed to generate feedback";
		}
	} catch (error) {
		console.error("Generation error:", error);
		generationError = "Network error. Please try again.";
	} finally {
		isGenerating = false;
	}
}

function handleAnnotationClick(span: AnnotationSpan, messageId: number, element: HTMLElement) {
	const rect = element.getBoundingClientRect();
	activeAnnotation = { span, messageId, rect };
}

function closeAnnotationPopup() {
	activeAnnotation = null;
}

// Get annotation for a specific message
function getAnnotationForMessage(messageId: number): MessageAnnotation | null {
	if (!feedback) return null;
	return feedback.annotations.find((a) => a.messageId === messageId) ?? null;
}

// Get comment for a specific message
function getCommentForMessage(messageId: number): string | null {
	const annotation = getAnnotationForMessage(messageId);
	return annotation?.comment ?? null;
}

// Grade color helper
function gradeColor(grade: "A" | "B" | "C"): string {
	return grade === "A" ? "bg-green-500" : grade === "B" ? "bg-amber-500" : "bg-red-500";
}
</script>

<div class="min-h-screen bg-[#fdfcf9] text-[#2a2520]">
	<!-- Header -->
	<div class="border-b border-[#e8e3db] bg-[#fdfcf9]/80 backdrop-blur-sm sticky top-0 z-10">
		<div class="mx-auto max-w-7xl px-6 py-4">
			<div class="flex items-center justify-between">
				<a href="/task/{data.taskId}" class="group flex items-center gap-2 text-[#6b6560] transition-colors hover:text-[#2a2520]">
					<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
					<span class="text-sm font-medium uppercase tracking-wide">Back to Task</span>
				</a>
				<h1 class="text-lg font-serif">{data.taskTitle}</h1>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<div class="mx-auto max-w-7xl px-6 py-12">
		{#if generationError}
			<div class="mb-8 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-800 mb-4">{generationError}</p>
				<Button onclick={triggerGeneration} variant="outline">Retry</Button>
			</div>
		{/if}

		<!-- Conversation + Comments Layout -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<!-- Left: Conversation History (2/3 on wide) -->
			<div class="lg:col-span-2 space-y-8">
				<h2 class="text-2xl font-serif text-[#2a2520] mb-6">Conversation Review</h2>

				{#each data.conversation.chains as chain, chainIdx}
					<div class="relative font-inter-stack">
						<!-- Chain label -->
						<div class="mb-4 flex items-center gap-3">
							<div class="h-px flex-1 bg-[#e8e3db]"></div>
							<span class="text-xs font-bold uppercase tracking-widest text-[#9b8f85]">{chain.label}</span>
							<div class="h-px flex-1 bg-[#e8e3db]"></div>
						</div>

						<!-- Messages in chain -->
						<div class="relative pl-6 border-l-2 border-[#e8e3db] text-sm">
							{#each chain.messages as message}
								<div class="mb-6 relative">
									<!-- Author badge -->
									<div class="mb-2 flex items-center gap-2">
										<span
											class="inline-block rounded-full px-3 py-1 text-xs font-medium {message.role === 'user' ? 'bg-[#4a7c59]/10 text-[#4a7c59]' : message.role === 'agent' ? 'bg-[#6b6560]/10 text-[#6b6560]' : 'bg-[#9b8f85]/10 text-[#9b8f85]'}"
										>
											{message.author}
										</span>
										<span class="text-xs text-[#9b8f85]">#{message.seqId}</span>
									</div>

									<!-- Message content -->
									{#if message.role === "user"}
										{@const annotation = getAnnotationForMessage(message.seqId)}
										{#if annotation}
											<AnnotatedMessage {annotation} messageId={message.seqId} onAnnotationClick={handleAnnotationClick} />
										{:else if isGenerating}
											<div class="rounded-lg bg-white border border-[#e8e3db] p-4">
												<p>{message.text}</p>
											</div>
										{:else}
											<div class="rounded-lg bg-white border border-[#e8e3db] p-4">
												<p>{message.text}</p>
											</div>
										{/if}
									{:else}
										<div class="rounded-lg bg-[#f5f2ed] border border-[#e8e3db] p-4">
											<p>{message.text}</p>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Right: Comments (1/3 on wide) -->
			<div class="lg:col-span-1">
				<div class="sticky top-24 space-y-6">
					<h2 class="text-xl font-serif mb-4">Tutor Comments</h2>

					{#if isGenerating}
						<div class="space-y-4">
							{#each data.conversation.allMessages.filter(m => m.role === "user") as _}
								<div class="rounded-lg border border-[#e8e3db] bg-white p-4">
									<Skeleton class="h-4 w-3/4 mb-2" />
									<Skeleton class="h-4 w-full mb-2" />
									<Skeleton class="h-4 w-5/6" />
								</div>
							{/each}
						</div>
					{:else if feedback}
						<div class="space-y-4">
							{#each data.conversation.allMessages.filter(m => m.role === "user") as message}
								{@const comment = getCommentForMessage(message.seqId)}
								{#if comment}
									<div class="rounded-lg border border-[#e8e3db] bg-white p-4 shadow-sm" transition:fade={{ duration: 200 }}>
										<div class="text-sm font-bold text-[#9b8f85] mb-2">Message #{message.seqId}</div>
										<div class="leading-relaxed whitespace-pre-wrap">
											{@html comment.replace(/<highlight>([\s\S]*?)<\/highlight>/g, '<span class="bg-yellow-200/60 px-1 rounded font-medium">$1</span>')}
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/if}

					<!-- Objectives & Summary -->
					{#if feedback}
						<div class="mt-8 space-y-6">
							<div class="border-t border-[#e8e3db] pt-6">
								<h3 class="text-lg font-serif mb-4">Objectives</h3>
								<div class="space-y-3">
									{#each feedback.objectives as objective}
										<div class="flex items-start gap-3">
											<span
												class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white {gradeColor(objective.grade)}"
											>
												{objective.grade}
											</span>
											<p class="text-sm text-[#2a2520] flex-1">{objective.text}</p>
										</div>
									{/each}
								</div>
							</div>

							<div class="border-t border-[#e8e3db] pt-6">
								<h3 class="text-lg font-serif mb-4">Summary</h3>
								<p class="whitespace-pre-wrap">{feedback.summary}</p>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Annotation popup -->
	{#if activeAnnotation}
		<AnnotationPopup
			annotation={activeAnnotation.span}
			messageId={activeAnnotation.messageId}
			rect={activeAnnotation.rect}
			sessionId={data.sessionId}
			onClose={closeAnnotationPopup}
		/>
	{/if}

	<!-- Floating question FAB -->
	<FloatingQuestionFAB sessionId={data.sessionId} conversation={data.conversation} />
</div>
