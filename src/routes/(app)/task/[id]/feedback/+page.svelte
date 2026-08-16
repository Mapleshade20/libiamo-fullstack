<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import { onMount } from "svelte";
import { fade } from "svelte/transition";
import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import SelectionActionBubble from "$lib/components/learning-feedback/SelectionActionBubble.svelte";
import TutorQuestionPanel from "$lib/components/learning-feedback/TutorQuestionPanel.svelte";
import type { LearningSelection, SelectionAppendRequest } from "$lib/components/learning-feedback/types";
import { Button } from "$lib/components/ui/button";
import { Skeleton } from "$lib/components/ui/skeleton";
import type { AnnotationSpan, FeedbackMessage, FeedbackResult, MessageAnnotation } from "$lib/feedback/types";
import type { LanguageCode } from "$lib/i18n";
import AnnotatedMessage from "./AnnotatedMessage.svelte";
import AnnotatedTutorComment from "./AnnotatedTutorComment.svelte";
import AnnotationPopup from "./AnnotationPopup.svelte";

let { data } = $props();

let feedback = $state<FeedbackResult | null>(null);
let isGenerating = $state(false);
let generationError = $state<string | null>(null);
let activeAnnotation = $state<{
	span: AnnotationSpan;
	messageId: number;
	rect: DOMRect;
	currentContext: string;
	previousContext: string;
	explanationMode: "issue" | "good_expression";
} | null>(null);
let askAppendRequest = $state<SelectionAppendRequest | null>(null);
let askAppendCounter = $state(0);

// Keep local state in sync if page data is refreshed.
$effect(() => {
	if (data.existingFeedback && !feedback) {
		feedback = data.existingFeedback;
	}
});

// Trigger client-only generation after mount. Calling fetch from an eager
// reactive effect can run during SSR and causes SvelteKit warnings.
onMount(() => {
	if (data.existingFeedback) {
		feedback = data.existingFeedback;
		return;
	}
	void triggerGeneration();
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

		const result = deserialize(await response.text());

		if (result.type === "success" && result.data?.feedback) {
			feedback = result.data.feedback as FeedbackResult;
			await invalidateAll();
		} else if (result.type === "failure") {
			generationError = (result.data?.error as string | undefined) ?? "Failed to generate feedback";
		} else {
			generationError = "Failed to generate feedback";
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
	const context = getMessageContext(messageId);
	activeAnnotation = { span, messageId, rect, ...context, explanationMode: "issue" };
}

function handleCommentHighlightClick(span: AnnotationSpan, messageId: number, element: HTMLElement, comment: string) {
	const rect = element.getBoundingClientRect();
	const messageContext = getMessageContext(messageId);
	activeAnnotation = {
		span,
		messageId,
		rect,
		currentContext: getCommentContext(messageId, comment),
		previousContext: messageContext.previousContext,
		explanationMode: "good_expression",
	};
}

function handleAskSelection(selection: LearningSelection) {
	askAppendCounter += 1;
	askAppendRequest = { id: askAppendCounter, selection };
}

async function postFeedbackAction(action: string, formData: FormData) {
	const response = await fetch(`?/${action}`, { method: "POST", body: formData });
	const result = deserialize(await response.text());
	if (result.type !== "success") {
		throw new Error((result.type === "failure" ? (result.data?.error as string | undefined) : undefined) ?? "Request failed");
	}
	return result.data;
}

async function saveSelection(selection: LearningSelection) {
	const formData = new FormData();
	formData.set("sessionId", String(data.sessionId));
	formData.set("selectedText", selection.text);
	formData.set("currentContext", selection.currentContext);
	formData.set("previousContext", selection.previousContext);
	formData.set("sourceKind", selection.sourceKind);
	const result = await postFeedbackAction("saveSelectionNotes", formData);
	return { count: Number(result?.count ?? 0), reason: result?.reason as string | null | undefined };
}

async function askTutor(input: LearningSelection & { question: string }) {
	const formData = new FormData();
	formData.set("sessionId", String(data.sessionId));
	formData.set("itemText", input.text);
	formData.set("category", "grammar");
	formData.set("question", input.question);
	formData.set("currentContext", input.currentContext);
	formData.set("previousContext", input.previousContext);
	const result = await postFeedbackAction("followUp", formData);
	if (typeof result?.answer !== "string") throw new Error("The Tutor returned an invalid response");
	return result.answer;
}

async function saveQaNote(input: LearningSelection & { question: string; answer: string }) {
	const formData = new FormData();
	formData.set("sessionId", String(data.sessionId));
	formData.set("selectedText", input.text);
	formData.set("surroundingContext", [input.previousContext, input.currentContext].filter(Boolean).join("\n\n"));
	formData.set("question", input.question);
	formData.set("answer", input.answer);
	await postFeedbackAction("saveSelectionQaNote", formData);
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

function findMessage(messageId: number): FeedbackMessage | null {
	return data.conversation.allMessages.find((message) => message.seqId === messageId) ?? null;
}

function getPreviousMessage(messageId: number): FeedbackMessage | null {
	for (const chain of data.conversation.chains) {
		const index = chain.messages.findIndex((message) => message.seqId === messageId);
		if (index > 0) return chain.messages[index - 1];
	}
	return null;
}

function getMessageContext(messageId: number): { currentContext: string; previousContext: string } {
	const message = findMessage(messageId);
	const previous = getPreviousMessage(messageId);
	return {
		currentContext: message ? `[${message.author}] ${message.text}` : getConversationExcerpt(),
		previousContext: previous ? `[${previous.author}] ${previous.text}` : "",
	};
}

function getCommentContext(messageId: number, comment: string): string {
	const message = findMessage(messageId);
	return [`Learner message: ${message?.text ?? ""}`, `Tutor comment: ${stripMarkTags(comment)}`].filter(Boolean).join("\n");
}

function getConversationExcerpt(): string {
	return data.conversation.allMessages
		.map((message) => `[${message.author}] ${message.text}`)
		.join("\n")
		.slice(0, 2500);
}

function stripMarkTags(value: string): string {
	return value.replace(/<\/?mark>/g, "");
}

// Grade color helper
function gradeColor(grade: "A" | "B" | "C"): string {
	return grade === "A" ? "bg-green-500" : grade === "B" ? "bg-amber-500" : "bg-red-500";
}
</script>

<svelte:head>
	<title>{data.taskTitle} · Feedback · Libiamo</title>
	<meta name="description" content="Review feedback, corrections, and tutor comments for your completed practice session.">
</svelte:head>

<div class="min-h-screen bg-[#fdfcf9] text-[#2a2520]">
	<!-- Header -->
	<div data-selection-ignore class="border-b border-[#e8e3db] bg-[#fdfcf9]/80 backdrop-blur-sm sticky top-0 z-10">
		<div class="mx-auto max-w-7xl px-4 py-4 sm:px-6">
			<div class="flex items-center justify-between gap-4">
				<a href="/task/{data.taskId}" class="group flex items-center gap-2 text-[#6b6560] transition-colors hover:text-[#2a2520]">
					<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
					<span class="hidden text-sm font-medium uppercase tracking-wide sm:inline">Back to Task</span>
				</a>
				<div class="min-w-0 flex items-center gap-3">
					<h1 class="min-w-0 truncate text-base">{data.taskTitle}</h1>
					<Button
						href="/task/{data.taskId}/session"
						variant="outline"
						size="icon-sm"
						class="border-[#d8d0c5] bg-white/70 text-[#2a2520] hover:bg-[#f5f2ed]"
						aria-label="Open practice session"
						title="Open practice session"
					>
						<MessageCircle size={16} strokeWidth={1.75} />
					</Button>
				</div>
			</div>
		</div>
	</div>

	<!-- Main content -->
	<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
		{#if generationError}
			<div class="mb-8 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
				<p class="text-red-800 mb-4">{generationError}</p>
				<Button onclick={triggerGeneration} variant="outline">Retry</Button>
			</div>
		{/if}

		<!-- Conversation + Comments Layout -->
		<div class="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-3">
			<!-- Left: Conversation History (2/3 on wide) -->
			<div class="min-w-0 space-y-8 lg:col-span-2">
				<h2 class="text-2xl font-serif text-[#2a2520] mb-6">Conversation Review</h2>

				{#each data.conversation.chains as chain, chainIdx}
					<div class="relative min-w-0 font-inter-stack">
						<!-- Chain label -->
						<div class="mb-4 flex items-center gap-3">
							<div class="h-px flex-1 bg-[#e8e3db]"></div>
							<span class="text-xs font-bold uppercase tracking-widest text-[#9b8f85]">{chain.label}</span>
							<div class="h-px flex-1 bg-[#e8e3db]"></div>
						</div>

						<!-- Messages in chain -->
						<div class="relative border-l-2 border-[#e8e3db] pl-4 text-sm sm:pl-6">
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
									<div
										data-learning-selectable
										data-learning-kind="message"
										data-message-id={message.seqId}
										data-current-context={getMessageContext(message.seqId).currentContext}
										data-previous-context={getMessageContext(message.seqId).previousContext}
									>
										{#if message.role === "user"}
											{@const annotation = getAnnotationForMessage(message.seqId)}
											{#if annotation}
												<AnnotatedMessage {annotation} messageId={message.seqId} onAnnotationClick={handleAnnotationClick} />
											{:else if isGenerating}
												<div class="rounded-lg border border-[#e8e3db] bg-white p-4">
													<p class="[overflow-wrap:anywhere]">{message.text}</p>
												</div>
											{:else}
												<div class="rounded-lg border border-[#e8e3db] bg-white p-4">
													<p class="[overflow-wrap:anywhere]">{message.text}</p>
												</div>
											{/if}
										{:else}
											<div class="rounded-lg border border-[#e8e3db] bg-[#f5f2ed] p-4">
												<p class="[overflow-wrap:anywhere]">{message.text}</p>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Right: Comments (1/3 on wide) -->
			<div class="min-w-0 lg:col-span-1">
				<div class="min-w-0 space-y-6 lg:sticky lg:top-24">
					<h2 class="text-xl font-serif mb-4">Tutor Comments</h2>

					{#if isGenerating}
						<div class="min-w-0 space-y-4">
							{#each data.conversation.allMessages.filter(m => m.role === "user") as _}
								<div class="rounded-lg border border-[#e8e3db] bg-white p-4">
									<Skeleton class="h-4 w-3/4 mb-2" />
									<Skeleton class="h-4 w-full mb-2" />
									<Skeleton class="h-4 w-5/6" />
								</div>
							{/each}
						</div>
					{:else if feedback}
						<div class="min-w-0 space-y-4">
							{#each data.conversation.allMessages.filter(m => m.role === "user") as message}
								{@const comment = getCommentForMessage(message.seqId)}
								{#if comment}
									{@const commentContext = getMessageContext(message.seqId)}
									<div
										data-learning-selectable
										data-learning-kind="comment"
										data-message-id={message.seqId}
										data-current-context={getCommentContext(message.seqId, comment)}
										data-previous-context={commentContext.previousContext}
										class="rounded-lg border border-[#e8e3db] bg-white p-4 shadow-sm [overflow-wrap:anywhere]"
										transition:fade={{ duration: 200 }}
									>
										<div class="text-sm font-bold text-[#9b8f85] mb-2">Message #{message.seqId}</div>
										<AnnotatedTutorComment
											{comment}
											messageId={message.seqId}
											onHighlightClick={(span, messageId, element) => handleCommentHighlightClick(span, messageId, element, comment)}
										/>
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
										<div
											data-learning-selectable
											data-learning-kind="objective"
											data-current-context={objective.text}
											data-previous-context={getConversationExcerpt()}
											class="flex items-start gap-3"
										>
											<span
												class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white {gradeColor(objective.grade)}"
											>
												{objective.grade}
											</span>
											<p class="min-w-0 flex-1 text-sm text-[#2a2520] [overflow-wrap:anywhere]">{objective.text}</p>
										</div>
									{/each}
								</div>
							</div>

							<div class="border-t border-[#e8e3db] pt-6">
								<h3 class="text-lg font-serif mb-4">Summary</h3>
								<p
									data-learning-selectable
									data-learning-kind="summary"
									data-current-context={feedback.summary}
									data-previous-context={getConversationExcerpt()}
									class="whitespace-pre-wrap [overflow-wrap:anywhere]"
								>
									{feedback.summary}
								</p>
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
			currentContext={activeAnnotation.currentContext}
			previousContext={activeAnnotation.previousContext}
			explanationMode={activeAnnotation.explanationMode}
			onClose={closeAnnotationPopup}
		/>
	{/if}

	<!-- Selection actions -->
	<SelectionActionBubble
		lang={(data.user.activeLanguage ?? data.language) as LanguageCode}
		sourceKey={`practice:${data.sessionId}`}
		onAskSelection={handleAskSelection}
		onSaveSelection={saveSelection}
	/>

	<!-- Floating question FAB -->
	<TutorQuestionPanel
		appendRequest={askAppendRequest}
		defaultSelection={{ text: getConversationExcerpt(), currentContext: getConversationExcerpt(), previousContext: "", sourceKind: "conversation" }}
		onAsk={askTutor}
		onSaveQa={saveQaNote}
	/>
</div>
