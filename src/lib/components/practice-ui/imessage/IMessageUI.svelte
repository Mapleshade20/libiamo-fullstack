<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Search from "@lucide/svelte/icons/search";
import { onDestroy } from "svelte";
import { fade } from "svelte/transition";
import { base } from "$app/paths";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { getDisplayClock } from "$lib/display-clock";
import { getTodayDateString, normalizeText } from "../../utils/messageUtils";
import FinishSessionSheet from "../FinishSessionSheet.svelte";
import { createHintController } from "../hint/controller.svelte";
import HintFloatingPanel from "../hint/HintFloatingPanel.svelte";
import { createPracticeSession } from "../session.svelte";
import TurnsLeftMobileBadge from "../TurnsLeftMobileBadge.svelte";
import type { PracticeUiRootProps } from "../types";
import { createIMessagePresentationAdapter } from "./adapter";
import ConversationMessageList from "./ConversationMessageList.svelte";
import { i18n } from "./i18n";
import { getLastOutgoingMessageId, getRenderableMessages, isLastOutgoingMessageRead } from "./presentation";

const clock = getDisplayClock();

let { taskId, userName, avatarUrl, language, existingSession, openingState, maxTurns, returnHref, feedbackHref }: PracticeUiRootProps = $props();

const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);
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

const adapter = createIMessagePresentationAdapter();
const session = createPracticeSession(() => ({
	adapter,
	userName,
	avatarUrl,
	language,
	existingSession,
	openingState,
	maxTurns,
	feedbackHref,
	labels: sessionLabels,
}));

const contactName = $derived(session.agentName);
const contactInitial = $derived(contactName.charAt(0).toUpperCase());
const renderableMessages = $derived(getRenderableMessages(session.messages));
const lastOutgoingMessageId = $derived(getLastOutgoingMessageId(renderableMessages));
const lastOutgoingRead = $derived(isLastOutgoingMessageRead(renderableMessages, session.agentReadUpToMessageId));
const latestPreviewText = $derived(normalizeText(renderableMessages.at(-1)?.text, t.startConversation));

let showFinishConfirm = $state(false);
let hintLayoutReference = $state<HTMLDivElement | null>(null);
const hint = createHintController({
	getContext: () => ({ sessionId: session.sessionId, language, draft: session.inputText, disabled: session.disabled }),
});

function handleInputKeydown(event: KeyboardEvent) {
	if (event.key === "Enter" && !event.shiftKey) {
		const isMobile = window.matchMedia("(max-width: 768px)").matches;
		if (!isMobile) {
			event.preventDefault();
			if (!session.inputText.trim() || session.disabled) return;
			const text = session.inputText.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);
			closeHintMenu();
			session.inputText = "";
			session.handleSend({ message: text });
		}
	}
}

function openHintMenu(trigger: HTMLElement) {
	hint.open(trigger);
}

function closeHintMenu() {
	hint.dismiss();
}

onDestroy(() => hint.destroy());

function handleWindowClick(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".hint-container-wrapper") && !target.closest(".hint-bubble")) {
		if (hint.isOpen) closeHintMenu();
	}
}

function handleFinishClick() {
	showFinishConfirm = true;
}

function handleFinishConfirm() {
	void session.handleCompleteAndNavigate();
}

function handleFinishCancel() {
	showFinishConfirm = false;
	session.clearCompletionError();
}

$effect(() => {
	if (session.completionError !== null) showFinishConfirm = true;
});

function getTaskHref() {
	return returnHref || `${base}/task/${taskId}`;
}
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

<div class="fixed inset-0 z-[999] h-[100dvh] w-full bg-[#F2F2F7] text-[#1C1C1E] font-inter-stack md:bg-[#DDDDE1]">
	<div class="mx-auto flex h-full w-full md:items-center md:justify-center md:p-3 lg:p-4">
		<div
			class="flex h-full w-full overflow-hidden md:h-[calc(100dvh-1.5rem)] md:w-[calc(100vw-1.5rem)] lg:h-[calc(100dvh-2rem)] lg:w-[calc(100vw-2rem)] md:max-h-[1100px] md:max-w-[1800px] md:rounded-2xl md:border md:border-black/10 md:bg-white md:shadow-2xl"
		>
			<aside class="hidden w-[290px] shrink-0 flex-col border-r border-[#E0D3D8] bg-[#F6E9EE] md:flex">
				<div class="border-b border-[#E8DDE2] px-4 py-3">
					<div class="mb-3 flex items-center gap-2">
						<a
							href={getTaskHref()}
							class="block h-3 w-3 rounded-full bg-[#FF5F57] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A84FF]"
							aria-label={t.returnTask}
							title={t.returnTask}
						></a>
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
			</aside>

			<section class="relative flex min-w-0 flex-1 flex-col bg-[#F2F2F7] md:bg-white">
				<div class="flex h-14 shrink-0 items-center justify-between border-b border-[#E5E5EA] bg-white px-4">
					<a href={getTaskHref()} class="flex items-center gap-1 text-[#0A84FF] md:hidden" aria-label={t.leaveTask}>
						<ChevronLeft size={18} />
						<span class="text-sm">{t.leaveTask}</span>
					</a>
					<div class="absolute left-1/2 -translate-x-1/2 text-center">
						<p class="text-sm font-semibold text-[#1C1C1E]">{contactName}</p>
					</div>
					<div class="ml-auto flex items-center gap-3">
						{#if session.remainingTurns !== null && !session.isCompleted}
							<TurnsLeftMobileBadge
								remainingTurns={session.remainingTurns}
								isCompleted={session.isCompleted}
								label={t.turnsLeft}
								class="rounded-full bg-[#E5E5EA] px-2.5 py-1 text-xs font-semibold text-[#8E8E93]"
							/>
							<span class="hidden text-xs text-[#8E8E93] md:inline">{t.turnsLeft}: {session.remainingTurns}</span>
						{/if}
						{#if !session.isCompleted && session.sessionId}
							<button
								type="button"
								class="rounded-full bg-[#0A84FF] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#0062CC] disabled:opacity-50"
								onclick={handleFinishClick}
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
						<span class="px-2 text-[11px] text-[#8E8E93]">{getTodayDateString(language, clock())}</span>
						<div class="h-px flex-1 bg-[#E5E5EA]"></div>
					</div>

					<ConversationMessageList
						messages={renderableMessages}
						{contactName}
						readLabel={t.read}
						deliveredLabel={t.delivered}
						{lastOutgoingMessageId}
						{lastOutgoingRead}
						retryLabel={t.retry}
						onRetry={(id) => session.handleRetry(id)}
					/>

					{#if (session.isTyping && lastOutgoingRead) || session.hasPendingReveals}
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
					<div bind:this={hintLayoutReference} class="relative">
						<textarea
							bind:value={session.inputText}
							maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
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
									aria-label={t.getHint}
									onclick={(event) => {
										event.stopPropagation();
										if (hint.isOpen) {
											closeHintMenu();
										} else {
											openHintMenu(event.currentTarget);
										}
									}}
									disabled={!session.sessionId || session.disabled}
								>
									<Lightbulb size={16} class={hint.isLoading ? "animate-pulse text-[#FF9F0A]" : ""} />
								</button>
							</div>
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A84FF] text-white transition-colors hover:bg-[#0062CC] disabled:bg-[#D1D1D6] md:bg-[#34C759] md:hover:bg-[#2DAE4F]"
								aria-label={t.sendMessage}
								onclick={() => {
									if (!session.inputText.trim() || session.disabled) return;
									const text = session.inputText.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);
									closeHintMenu();
									session.inputText = "";
									session.handleSend({ message: text });
								}}
								disabled={!session.inputText.trim() || session.disabled}
							>
								<ArrowUp size={16} />
							</button>
						</div>
					</div>
					{#if hint.isOpen}
						<HintFloatingPanel
							anchorName="--libiamo-imessage-hint-anchor"
							layoutReference={hintLayoutReference}
							motionOrigin={hint.motionOrigin}
							{language}
							bind:expressionQuery={hint.expressionQuery}
							bind:activeMode={hint.mode}
							bind:submittedExpressionQuery={hint.submittedQuery}
							expressionPhrases={hint.phrases}
							contentHint={hint.contentHint}
							hintError={hint.error}
							isGettingHint={hint.isLoading}
							disabled={session.disabled}
							onExpressionSubmit={hint.requestExpression}
							onContentHint={hint.requestContent}
							onReset={hint.reset}
							onClose={closeHintMenu}
						/>
					{/if}
				</div>
			</section>
		</div>
	</div>
</div>

<FinishSessionSheet
	show={showFinishConfirm}
	{language}
	pending={session.isCompleting}
	error={session.completionError}
	onConfirm={handleFinishConfirm}
	onCancel={handleFinishCancel}
/>
