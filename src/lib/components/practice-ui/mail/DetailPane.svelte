<script lang="ts">
import Archive from "@lucide/svelte/icons/archive";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import Paperclip from "@lucide/svelte/icons/paperclip";
import Trash2 from "@lucide/svelte/icons/trash-2";
import UserCircle from "@lucide/svelte/icons/user-circle";
import type { ChatMessage } from "../chatMessages";
import type { DraftEmail } from "./types";

let {
	messageScroll = $bindable(null as HTMLElement | null),
	selectedSentEmail = null as DraftEmail | null,
	selectedSentMessage = null as ChatMessage | null,
	todayLabel = "",
	userName = "Learner",
	avatarUrl = "",
	isCompleted = false,
	isInitializing = false,
	isSubmitting = false,
	isBusy = false,
	t = {} as Record<string, string>,
	onMockAction = () => {},
}: {
	messageScroll?: HTMLElement | null;
	selectedSentEmail?: DraftEmail | null;
	selectedSentMessage?: ChatMessage | null;
	todayLabel?: string;
	userName?: string;
	avatarUrl?: string;
	isCompleted?: boolean;
	isInitializing?: boolean;
	isSubmitting?: boolean;
	isBusy?: boolean;
	t?: Record<string, string>;
	onMockAction?: () => void;
} = $props();
</script>

<main class="mail-detail flex min-w-0 flex-col bg-white">
	<header class="toolbar flex h-13 shrink-0 items-center gap-2 border-b border-black/10 bg-[#F7F7F9]/90 px-3 backdrop-blur-xl">
		<button type="button" class="icon-button" onclick={onMockAction} title={t.archive}><Archive size={18} /></button>
		<button type="button" class="icon-button" onclick={onMockAction} title={t.trash}><Trash2 size={18} /></button>
		<div class="mx-1 h-6 w-px bg-black/10"></div>
		<button type="button" class="icon-button" onclick={onMockAction} title="Attach"><Paperclip size={18} /></button>
		<div class="ml-auto text-xs font-medium text-[#6E6E73]">
			{isCompleted ? t.questCompleted : isInitializing || isSubmitting ? t.evaluating : ""}
		</div>
	</header>

	<div bind:this={messageScroll} class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
		{#if selectedSentEmail}
			<article class="mx-auto max-w-3xl">
				<div class="mb-5 border-b border-black/10 pb-5">
					<h1 class="text-2xl font-semibold tracking-tight">{selectedSentEmail.subject || t.noSubject}</h1>
					<div class="mt-4 flex items-start gap-3 text-sm">
						{#if avatarUrl}
							<img src={avatarUrl} alt="" class="h-10 w-10 rounded-full object-cover">
						{:else}
							<UserCircle size={40} class="text-[#8E8E93]" />
						{/if}
						<div class="min-w-0">
							<div class="font-semibold">{userName}</div>
							<div class="truncate text-[#6E6E73]">{t.to}: {selectedSentEmail.to}</div>
						</div>
						<div class="ml-auto shrink-0 text-xs text-[#6E6E73]">{selectedSentMessage?.timestamp}</div>
					</div>
				</div>
				<div class="whitespace-pre-wrap text-[15px] leading-7 text-[#1D1D1F]" style:text-align={selectedSentEmail.bodyAlign ?? 'left'}>
					{selectedSentEmail.body}
				</div>

				{#if isBusy}
					<div class="mt-8 flex items-center gap-2 text-sm text-[#6E6E73]">
						<LoaderCircle size={16} class="animate-spin" />
						{isSubmitting ? t.sending : t.evaluating}
					</div>
				{/if}
			</article>
		{:else}
			<div class="flex h-full items-center justify-center text-sm text-[#6E6E73]">{t.newMessage}</div>
		{/if}
	</div>
</main>
