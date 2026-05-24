<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Search from "@lucide/svelte/icons/search";
import EmojiConvertor from "emoji-js";
import { onMount } from "svelte";
import { fade } from "svelte/transition";
import { deserialize } from "$app/forms";
import MarkdownRenderer from "../../MarkdownRenderer.svelte";
import { getTodayDateString, normalizeText } from "../../utils/messageUtils";
import EvaluationRetryNotice from "../EvaluationRetryNotice.svelte";
import { createPracticeSession } from "../session.svelte";
import { i18n } from "./i18n";
import { getBubbleGroupPosition, getLastOutgoingMessageId, getRenderableMessages } from "./presentation";

interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	timeZone?: string;
	existingSession?: any;
	openingState?: unknown;
	maxTurns?: number;
	agentStartsFirst?: boolean;
}

let {
	taskId = "",
	userName = "Learner",
	avatarUrl = "",
	language = "en",
	timeZone = "UTC",
	existingSession = null,
	openingState = null,
	maxTurns = 0,
	agentStartsFirst = true,
}: Props = $props();

const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);
const IMESSAGE_JOIN_TRIGGER_TEXT = "*Session started*";
const sessionLabels = {
	get stillProcessingMessage() {
		return t.stillProcessingMessage;
	},
	get retryFailedMessage() {
		return t.retryFailedMessage;
	},
	get earlier() {
		return t.earlier;
	},
};

const session = createPracticeSession(() => ({
	userName,
	avatarUrl,
	language,
	existingSession,
	openingState,
	maxTurns,
	agentStartsFirst,
	timeZone,
	labels: sessionLabels,
	joinTriggerText: IMESSAGE_JOIN_TRIGGER_TEXT,
	// Keep old marker support so existing sessions stay hidden.
	isHiddenCheck: (m) => m.content === IMESSAGE_JOIN_TRIGGER_TEXT || m.content === "*User joined the server*",
}));

const emojiConv = new EmojiConvertor();
emojiConv.replace_mode = "unified";
emojiConv.allow_native = true;

const contactName = $derived(session.agentName);
const contactInitial = $derived(contactName.charAt(0).toUpperCase());
const renderableMessages = $derived(getRenderableMessages(session.messages));
const lastOutgoingMessageId = $derived(getLastOutgoingMessageId(renderableMessages));
const latestPreviewText = $derived(normalizeText(renderableMessages.at(-1)?.text, t.startConversation));

let showHintMenu = $state(false);
let hints = $state<Array<{ text: string; translation?: string }>>([]);
let isGettingHint = $state(false);
let hintAbortController: AbortController | null = null;

function handleInputKeydown(event: KeyboardEvent) {
	if (event.key === "Enter" && !event.shiftKey) {
		const isMobile = window.matchMedia("(max-width: 768px)").matches;
		if (!isMobile) {
			event.preventDefault();
			if (!session.inputText.trim() || session.disabled) return;
			const text = session.inputText;
			session.inputText = "";
			session.handleSend(text);
		}
	}
}

async function handleGetHint() {
	if (!session.sessionId || session.isCompleted || session.disabled) return;
	if (isGettingHint) return;

	isGettingHint = true;
	showHintMenu = true;
	hints = [];
	hintAbortController = new AbortController();
	try {
		const formData = new FormData();
		formData.append("sessionId", String(session.sessionId));
		const res = await fetch(`?/hint`, {
			method: "POST",
			body: formData,
			signal: hintAbortController.signal,
		});
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			hints = ((result.data as { hints?: Array<{ text: string; translation?: string }> }).hints ?? []).filter((hint) => Boolean(hint.text));
		}
	} catch (error) {
		if (!(error instanceof DOMException && error.name === "AbortError")) {
			console.error("Failed to get hints:", error);
		}
	} finally {
		isGettingHint = false;
		hintAbortController = null;
	}
}

function closeHintMenu() {
	showHintMenu = false;
	if (isGettingHint && hintAbortController) {
		hintAbortController.abort();
	}
	isGettingHint = false;
	hintAbortController = null;
}

function selectHint(text: string) {
	session.inputText = text;
	showHintMenu = false;
}

function handleWindowClick(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".hint-container-wrapper")) {
		if (showHintMenu) closeHintMenu();
	}
}

function getBubbleClasses(message: (typeof renderableMessages)[0], index: number) {
	const position = getBubbleGroupPosition(renderableMessages, index);
	if (message.role === "user") {
		if (position === "start") return "rounded-[20px] rounded-br-md bg-[#0A84FF] text-white md:bg-[#34C759]";
		if (position === "middle") return "rounded-[20px] rounded-tr-md rounded-br-md bg-[#0A84FF] text-white md:bg-[#34C759]";
		if (position === "end") return "rounded-[20px] rounded-tr-md bg-[#0A84FF] text-white md:bg-[#34C759]";
		return "rounded-[20px] bg-[#0A84FF] text-white md:bg-[#34C759]";
	}

	if (position === "start") return "rounded-[20px] rounded-bl-md bg-[#E5E5EA] text-[#1C1C1E] md:bg-[#ECECEF]";
	if (position === "middle") return "rounded-[20px] rounded-tl-md rounded-bl-md bg-[#E5E5EA] text-[#1C1C1E] md:bg-[#ECECEF]";
	if (position === "end") return "rounded-[20px] rounded-tl-md bg-[#E5E5EA] text-[#1C1C1E] md:bg-[#ECECEF]";
	return "rounded-[20px] bg-[#E5E5EA] text-[#1C1C1E] md:bg-[#ECECEF]";
}

function showIncomingSender(index: number) {
	const current = renderableMessages[index];
	const prev = index > 0 ? renderableMessages[index - 1] : null;
	return current?.role === "agent" && prev?.role !== "agent";
}

onMount(() => {
	return () => {
		if (hintAbortController) hintAbortController.abort();
	};
});
</script>

<svelte:window onclick={handleWindowClick} />

{#if session.isEntering}
	<div class="fixed inset-0 z-[3000] flex items-center justify-center bg-white/95" out:fade={{ duration: 150 }}>
		<div class="flex items-center gap-1">
			<span class="h-2.5 w-2.5 animate-bounce rounded-full bg-[#0A84FF]"></span>
			<span class="h-2.5 w-2.5 animate-bounce rounded-full bg-[#0A84FF]" style="animation-delay: 0.15s"></span>
			<span class="h-2.5 w-2.5 animate-bounce rounded-full bg-[#0A84FF]" style="animation-delay: 0.3s"></span>
		</div>
	</div>
{/if}

<div class="fixed inset-0 z-[999] h-[100dvh] w-full bg-[#F2F2F7] text-[#1C1C1E] md:bg-[#DDDDE1]">
	<div class="mx-auto flex h-full w-full md:items-center md:justify-center md:p-3 lg:p-4">
		<div
			class="flex h-full w-full overflow-hidden md:h-[calc(100dvh-1.5rem)] md:w-[calc(100vw-1.5rem)] lg:h-[calc(100dvh-2rem)] lg:w-[calc(100vw-2rem)] md:max-h-[1100px] md:max-w-[1800px] md:rounded-2xl md:border md:border-black/10 md:bg-white md:shadow-2xl"
		>
			<aside class="hidden w-[290px] shrink-0 flex-col border-r border-[#E0D3D8] bg-[#F6E9EE] md:flex">
				<div class="border-b border-[#E8DDE2] px-4 py-3">
					<div class="mb-3 flex items-center gap-2">
						<span class="h-3 w-3 rounded-full bg-[#FF5F57]"></span>
						<span class="h-3 w-3 rounded-full bg-[#FEBC2E]"></span>
						<span class="h-3 w-3 rounded-full bg-[#28C840]"></span>
					</div>
					<div class="flex items-center gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs text-[#8E8E93] shadow-sm">
						<Search size={12} />
						<span>{t.messages}</span>
					</div>
				</div>
				<div class="px-2 py-2">
					<button type="button" class="flex w-full items-center gap-3 rounded-xl bg-[#0A84FF] px-3 py-2.5 text-left text-white shadow-sm">
						<div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-[#1C1C1E]">
							{contactInitial}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-semibold">{contactName}</p>
							<p class="truncate text-[11px] text-white/80">{latestPreviewText}</p>
						</div>
						<div class="text-right text-[10px] text-white/80">
							<p>now</p>
						</div>
					</button>
				</div>
				<div class="mt-auto border-t border-[#E8DDE2] p-3">
					<a href={`/task/${taskId}`} class="text-xs font-medium text-[#0A84FF] hover:underline">{t.returnTask}</a>
				</div>
			</aside>

			<section class="relative flex min-w-0 flex-1 flex-col bg-[#F2F2F7] md:bg-white">
				<div class="flex h-14 shrink-0 items-center justify-between border-b border-[#E5E5EA] bg-white px-4">
					<div class="flex items-center gap-1 text-[#0A84FF] md:hidden">
						<ChevronLeft size={18} />
						<span class="text-sm">{t.messages}</span>
					</div>
					<div class="absolute left-1/2 -translate-x-1/2 text-center">
						<p class="text-sm font-semibold text-[#1C1C1E]">{contactName}</p>
					</div>
					<div class="ml-auto flex items-center gap-3">
						{#if session.remainingTurns !== null && !session.isCompleted}
							<span class="hidden text-xs text-[#8E8E93] md:inline">{t.turnsLeft}: {session.remainingTurns}</span>
						{/if}
						{#if !session.isCompleted && session.sessionId}
							<button
								type="button"
								class="rounded-full bg-[#0A84FF] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#0062CC] disabled:opacity-50"
								onclick={session.handleComplete}
								disabled={session.isCompleting || session.isSubmitting || session.isInitializing}
							>
								{session.isCompleting ? t.evaluating : t.finishTask}
							</button>
						{/if}
					</div>
				</div>

				<div bind:this={session.chatContainer} class="flex-1 overflow-y-auto px-3 py-4 md:bg-[#F9F9FB] md:px-8 md:py-6">
					<div class="mb-4 flex items-center justify-center md:hidden">
						<div class="h-px flex-1 bg-[#E5E5EA]"></div>
						<span class="px-2 text-[11px] text-[#8E8E93]">{getTodayDateString(language, timeZone)}</span>
						<div class="h-px flex-1 bg-[#E5E5EA]"></div>
					</div>

					{#each renderableMessages as msg, index (msg.id)}
						<div class="mb-1.5 flex flex-col {msg.role === 'user' ? 'items-end' : 'items-start'}">
							{#if showIncomingSender(index)}
								<span class="mb-1 ml-2 hidden text-[11px] text-[#8E8E93] md:block">{contactName}</span>
							{/if}
							<div class="max-w-[82%] px-3 py-2 text-[15px] leading-5 shadow-sm md:max-w-[68%] {getBubbleClasses(msg, index)}">
								<MarkdownRenderer content={emojiConv.replace_colons(msg.text)} />
							</div>
							{#if msg.role === "agent" && msg.deliveryState === "failed"}
								<button
									type="button"
									class="mt-1 ml-1 rounded-full border border-[#0A84FF] px-2 py-0.5 text-[11px] font-semibold text-[#0A84FF] hover:bg-[#EAF2FF]"
									onclick={() => session.handleRetry(msg.id)}
								>
									{t.retry}
								</button>
							{/if}
							{#if msg.role === "user" && msg.id === lastOutgoingMessageId}
								<span class="mt-1 mr-1 text-[11px] text-[#8E8E93]">{t.read}</span>
							{/if}
						</div>
					{/each}

					{#if session.isTyping}
						<div class="mt-3 flex items-center">
							<div class="rounded-[18px] bg-[#E5E5EA] px-3 py-2">
								<div class="flex gap-1">
									<span class="h-2 w-2 animate-bounce rounded-full bg-[#8E8E93]"></span>
									<span class="h-2 w-2 animate-bounce rounded-full bg-[#8E8E93]" style="animation-delay: 0.15s"></span>
									<span class="h-2 w-2 animate-bounce rounded-full bg-[#8E8E93]" style="animation-delay: 0.3s"></span>
								</div>
							</div>
							<span class="ml-2 text-[11px] text-[#8E8E93]">{t.thinking}</span>
						</div>
					{/if}
				</div>

				<div class="shrink-0 border-t border-[#E5E5EA] bg-white px-3 py-3 md:px-6">
					<div class="relative">
						<textarea
							bind:value={session.inputText}
							rows="1"
							class="block min-h-11 max-h-40 w-full resize-none rounded-[22px] border border-[#D1D1D6] bg-white px-4 py-2.5 pr-24 text-[15px] leading-5 outline-none placeholder:text-[#8E8E93] focus:border-[#0A84FF] md:rounded-full md:pr-26"
							placeholder={session.isCompleted
								? t.sessionEnded
								: session.limitReached
									? t.turnLimitReached
									: session.isWaitingRetry
										? t.retryInputPlaceholder
										: t.messagePlaceholder}
							onkeydown={handleInputKeydown}
							disabled={session.disabled}
						></textarea>
						<div class="absolute top-1/2 right-4 z-10 flex -translate-y-1/2 items-center gap-2 md:right-8">
							<div class="hint-container-wrapper relative">
								<button
									type="button"
									class="flex h-8 w-8 items-center justify-center rounded-full border border-[#D1D1D6] bg-white text-[#8E8E93] transition-colors hover:text-[#1C1C1E] disabled:opacity-50"
									title={t.getHint}
									onclick={(event) => {
										event.stopPropagation();
										if (showHintMenu) {
											closeHintMenu();
										} else {
											handleGetHint();
										}
									}}
									disabled={!session.sessionId || session.disabled}
								>
									<Lightbulb size={16} class={isGettingHint ? "animate-pulse text-[#FF9F0A]" : ""} />
								</button>

								{#if showHintMenu}
									<div
										class="absolute right-0 bottom-[calc(100%+8px)] z-20 w-72 overflow-hidden rounded-xl border border-[#D1D1D6] bg-white shadow-xl"
									>
										<div class="flex items-center justify-between border-b border-[#E5E5EA] px-3 py-2">
											<span class="text-xs font-semibold uppercase tracking-wide text-[#8E8E93]">{t.hintTitle}</span>
											<button
												type="button"
												class="text-sm text-[#8E8E93] hover:text-[#1C1C1E]"
												onclick={(event) => {
													event.stopPropagation();
													closeHintMenu();
												}}
											>
												&times;
											</button>
										</div>
										<div class="max-h-64 space-y-1 overflow-y-auto p-2">
											{#if isGettingHint}
												<p class="py-5 text-center text-sm text-[#8E8E93] italic">{t.thinking}</p>
											{:else if hints.length === 0}
												<p class="py-5 text-center text-sm text-[#8E8E93]">{t.noHints}</p>
											{:else}
												{#each hints as hint}
													<button
														type="button"
														class="w-full rounded-lg border border-transparent px-2.5 py-2 text-left hover:border-[#E5E5EA] hover:bg-[#F7F7FA]"
														onclick={() => selectHint(hint.text)}
													>
														<p class="text-sm text-[#1C1C1E]">{hint.text}</p>
														{#if hint.translation}
															<p class="mt-0.5 text-xs text-[#8E8E93]">{hint.translation}</p>
														{/if}
													</button>
												{/each}
											{/if}
										</div>
									</div>
								{/if}
							</div>
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A84FF] text-white transition-colors hover:bg-[#0062CC] disabled:bg-[#D1D1D6] md:bg-[#34C759] md:hover:bg-[#2DAE4F]"
								aria-label={t.sendMessage}
								onclick={() => {
								if (!session.inputText.trim() || session.disabled) return;
									const text = session.inputText;
									session.inputText = "";
									session.handleSend(text);
								}}
								disabled={!session.inputText.trim() || session.disabled}
							>
								<ArrowUp size={16} />
							</button>
						</div>
					</div>
				</div>
			</section>
		</div>
	</div>
</div>

{#if session.showEvaluationModal && session.feedback}
	<div transition:fade={{ duration: 200 }} class="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
		<div class="max-h-[80vh] w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
			<div class="border-b border-[#E5E5EA] px-6 py-4">
				<h2 class="text-lg font-semibold text-[#1C1C1E]">{t.questCompleted}</h2>
				<p class="text-sm text-[#8E8E93]">{t.tutorReport}</p>
			</div>
			<div class="max-h-[52vh] overflow-y-auto px-6 py-4">
				<h3 class="text-xs font-semibold uppercase tracking-wider text-[#8E8E93]">{t.overallFeedback}</h3>
				<p class="mt-2 whitespace-pre-wrap rounded-xl bg-[#F2F2F7] p-4 text-sm leading-6 text-[#1C1C1E]">{session.feedback.content}</p>
				{#if session.feedback.objectiveResults && session.feedback.objectiveResults.length > 0}
					<h3 class="mt-6 text-xs font-semibold uppercase tracking-wider text-[#8E8E93]">{t.objectiveAssessment}</h3>
					<div class="mt-2 space-y-2">
						{#each session.feedback.objectiveResults as obj}
							<div class="flex items-center justify-between rounded-xl bg-[#F2F2F7] px-3 py-2">
								<span class="pr-4 text-sm text-[#1C1C1E]">{obj.text}</span>
								<span
									class="rounded-md px-2 py-1 text-xs font-bold {obj.grade === 'A' ? 'bg-[#34C759] text-white' : obj.grade === 'B' ? 'bg-[#FFD60A] text-[#1C1C1E]' : 'bg-[#FF3B30] text-white'}"
								>
									{obj.grade}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="flex justify-end gap-2 border-t border-[#E5E5EA] px-6 py-4">
				<button
					type="button"
					class="rounded-lg bg-[#E5E5EA] px-4 py-2 text-sm font-medium text-[#1C1C1E]"
					onclick={() => (session.showEvaluationModal = false)}
				>
					{t.closeReview}
				</button>
				<a href="/" class="rounded-lg bg-[#0A84FF] px-4 py-2 text-sm font-medium text-white">{t.returnHall}</a>
			</div>
		</div>
	</div>
{/if}

{#if session.needsEvaluationRetry}
	<div class="fixed top-4 right-4 left-4 z-[1200] mx-auto max-w-xl">
		<EvaluationRetryNotice message={session.evaluationError ?? undefined} isRetrying={session.isCompleting} onRetry={session.handleComplete} />
	</div>
{/if}
