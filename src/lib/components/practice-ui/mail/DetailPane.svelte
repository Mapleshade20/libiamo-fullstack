<script lang="ts">
import Archive from "@lucide/svelte/icons/archive";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import Paperclip from "@lucide/svelte/icons/paperclip";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Trash2 from "@lucide/svelte/icons/trash-2";
import UserCircle from "@lucide/svelte/icons/user-circle";
import type { ChatMessage } from "../chatMessages";
import TurnsLeftMobileBadge from "../TurnsLeftMobileBadge.svelte";
import { plainTextToDraftHtml } from "./mailUtils";
import type { DraftEmail, NormalizedMailEmail } from "./types";

let {
	messageScroll = $bindable(null as HTMLElement | null),
	selectedInboxEmail = null as NormalizedMailEmail | null,
	selectedSentEmail = null as DraftEmail | null,
	selectedSentMessage = null as ChatMessage | null,
	todayLabel = "",
	userName = "Learner",
	avatarUrl = "",
	isCompleted = false,
	isInitializing = false,
	isSubmitting = false,
	isCompleting = false,
	isBusy = false,
	t = {} as Record<string, string>,
	remainingTurns = null as number | null,
	canFinish = false,
	onMockAction = () => {},
	onComplete = () => {},
	onRetry = (_messageId: string) => {},
}: {
	messageScroll?: HTMLElement | null;
	selectedInboxEmail?: NormalizedMailEmail | null;
	selectedSentEmail?: DraftEmail | null;
	selectedSentMessage?: ChatMessage | null;
	todayLabel?: string;
	userName?: string;
	avatarUrl?: string;
	isCompleted?: boolean;
	isInitializing?: boolean;
	isSubmitting?: boolean;
	isCompleting?: boolean;
	isBusy?: boolean;
	t?: Record<string, string>;
	remainingTurns?: number | null;
	canFinish?: boolean;
	onMockAction?: () => void;
	onComplete?: () => void;
	onRetry?: (messageId: string) => void;
} = $props();

const detailEmail = $derived(
	selectedSentEmail
		? {
				subject: selectedSentEmail.subject,
				fromName: userName,
				to: selectedSentEmail.to,
				time: selectedSentMessage?.timestamp ?? todayLabel,
				bodyHtml: selectedSentEmail.bodyHtml ?? "",
				deliveryState: undefined,
				messageId: undefined,
			}
		: selectedInboxEmail
			? {
					subject: selectedInboxEmail.subject,
					fromName: selectedInboxEmail.displayFrom,
					to: selectedInboxEmail.to,
					time: selectedInboxEmail.time || todayLabel,
					bodyHtml: plainTextToDraftHtml(selectedInboxEmail.body),
					deliveryState: selectedInboxEmail.deliveryState,
					messageId: selectedInboxEmail.messageId,
				}
			: null,
);
const displayBodyHtml = $derived(detailEmail?.bodyHtml ?? "");
const remainingTurnsLabel = $derived(remainingTurns === null ? "" : (t.turnsLeft || "Up to {count} more").replace("{count}", String(remainingTurns)));
</script>

<div class="mail-detail flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
	<header class="toolbar flex h-13 shrink-0 items-center gap-2 border-b border-black/10 bg-[#F7F7F9]/90 px-3 backdrop-blur-xl">
		<button type="button" class="icon-button" onclick={onMockAction} title={t.archive}><Archive size={18} /></button>
		<button type="button" class="icon-button" onclick={onMockAction} title={t.trash}><Trash2 size={18} /></button>
		<div class="mx-1 h-6 w-px bg-black/10"></div>
		<button type="button" class="icon-button" onclick={onMockAction} title="Attach"><Paperclip size={18} /></button>
		<div class="ml-auto flex items-center gap-2">
			{#if isCompleted}
				<div
					class="inline-flex items-center gap-1.5 rounded-full border border-[#34C759]/25 bg-[#EAF8EE] px-3 py-1 text-xs font-semibold text-[#1F7A38]"
				>
					<CheckCircle2 size={14} />
					{t.questCompleted}
				</div>
			{:else}
				{#if isInitializing || isSubmitting || isCompleting}
					<div
						class="inline-flex items-center gap-1.5 rounded-full border border-[#3478F6]/20 bg-[#EDF4FF] px-3 py-1 text-xs font-semibold text-[#2155A3]"
					>
						<LoaderCircle size={14} class="animate-spin" />
						{isCompleting ? t.evaluating : isSubmitting ? t.waitingForReply : t.loadingMail}
					</div>
				{/if}
				{#if remainingTurns !== null}
					<TurnsLeftMobileBadge
						{remainingTurns}
						{isCompleted}
						label={t.turnsLeft || "Up to {count} more"}
						class="rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-[#6E6E73]"
					/>
					<div class="hidden rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-[#6E6E73] md:block">
						{remainingTurnsLabel}
					</div>
				{/if}
				<button
					type="button"
					class="rounded-full bg-[#3478F6] px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#0A64FF] disabled:cursor-not-allowed disabled:opacity-50"
					onclick={() => onComplete()}
					disabled={!canFinish || isBusy || isSubmitting || isInitializing || isCompleting}
				>
					{t.finishTask}
				</button>
			{/if}
		</div>
	</header>

	<div bind:this={messageScroll} class="detail-scroll min-h-0 flex-1 overflow-y-scroll p-5 sm:p-8">
		{#if detailEmail}
			<article class="mx-auto max-w-3xl">
				<div class="mb-5 border-b border-black/10 pb-5">
					<h1 class="text-2xl font-semibold tracking-tight">{detailEmail.subject || t.noSubject}</h1>
					<div class="mt-4 flex items-start gap-3 text-sm">
						{#if selectedSentEmail && avatarUrl}
							<img src={avatarUrl} alt="" class="h-10 w-10 rounded-full object-cover">
						{:else}
							<UserCircle size={40} class="text-[#8E8E93]" />
						{/if}
						<div class="min-w-0">
							<div class="font-semibold">{detailEmail.fromName}</div>
							<div class="truncate text-[#6E6E73]">{t.to}: {detailEmail.to}</div>
						</div>
						<div class="ml-auto shrink-0 text-xs text-[#6E6E73]">{detailEmail.time}</div>
					</div>
				</div>
				<div class="mail-body text-[15px] leading-7 text-[#1D1D1F]">{@html displayBodyHtml}</div>

				{#if isBusy}
					<div class="mt-8 flex items-center gap-2 text-sm text-[#6E6E73]">
						<LoaderCircle size={16} class="animate-spin" />
						{isCompleting ? t.evaluating : isSubmitting ? t.waitingForReply : t.loadingMail}
					</div>
				{/if}
				{#if detailEmail.deliveryState === "failed" && detailEmail.messageId}
					<button
						type="button"
						class="mt-6 inline-flex items-center gap-2 rounded-full border border-[#D70015]/20 bg-[#FFF1F2] px-3 py-1.5 text-sm font-semibold text-[#B00020] transition-colors hover:bg-[#FFE4E6]"
						onclick={() => onRetry(detailEmail.messageId ?? "")}
						disabled={isBusy || isCompleted}
					>
						<RotateCcw size={15} />
						{t.retry}
					</button>
				{/if}
			</article>
		{:else}
			<div class="h-full bg-white" aria-label={t.inbox}></div>
		{/if}
	</div>
</div>

<style>
.mail-body :global(div),
.mail-body :global(p) {
	min-height: 1.75rem;
}

.mail-body :global(ul),
.mail-body :global(ol) {
	margin: 0.75rem 0;
	padding-left: 1.5rem;
}

.mail-body :global(ul) {
	list-style: disc;
}

.mail-body :global(ol) {
	list-style: decimal;
}

.mail-body :global(blockquote) {
	margin: 0.75rem 0 0.75rem 1.5rem;
}

.detail-scroll {
	scrollbar-gutter: stable;
	scrollbar-width: thin;
	scrollbar-color: rgb(142 142 147 / 0.55) rgb(242 242 247 / 0.95);
}

.detail-scroll::-webkit-scrollbar {
	width: 12px;
}

.detail-scroll::-webkit-scrollbar-track {
	background: rgb(242 242 247 / 0.95);
}

.detail-scroll::-webkit-scrollbar-thumb {
	background: rgb(142 142 147 / 0.55);
	border: 3px solid rgb(242 242 247 / 0.95);
	border-radius: 999px;
}

.detail-scroll::-webkit-scrollbar-thumb:hover {
	background: rgb(99 99 102 / 0.7);
}
</style>
