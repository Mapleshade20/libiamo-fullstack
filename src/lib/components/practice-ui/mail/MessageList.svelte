<script lang="ts">
import PanelLeft from "@lucide/svelte/icons/panel-left";
import Search from "@lucide/svelte/icons/search";
import type { ChatMessage } from "../chatMessages";
import { parseDraftFromMessage } from "./mailUtils";
import type { NormalizedMailEmail } from "./types";

let {
	inboxEmails = [] as NormalizedMailEmail[],
	sentMessages = [] as ChatMessage[],
	selectedSentId = null as string | null,
	activeView = "inbox",
	todayLabel = "",
	t = {} as Record<string, string>,
	onOpenSidebar = () => {},
	onSearchFocus = () => {},
	onSelectSentMessage = (_messageId: string) => {},
}: {
	inboxEmails?: NormalizedMailEmail[];
	sentMessages?: ChatMessage[];
	selectedSentId?: string | null;
	activeView?: "inbox" | "sent";
	todayLabel?: string;
	t?: Record<string, string>;
	onOpenSidebar?: () => void;
	onSearchFocus?: () => void;
	onSelectSentMessage?: (messageId: string) => void;
} = $props();
</script>

<section class="mail-list border-r border-black/10 bg-[#F7F7F9]">
	<header class="toolbar flex h-13 items-center gap-2 border-b border-black/10 px-3">
		<button type="button" class="icon-button mobile-only" aria-label="Mailboxes" onclick={onOpenSidebar}><PanelLeft size={18} /></button>
		<div class="relative min-w-0 flex-1">
			<Search class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#8E8E93]" size={15} />
			<input
				class="h-8 w-full rounded-lg border border-black/10 bg-white/80 pl-8 pr-2 text-sm outline-none placeholder:text-[#8E8E93] focus:border-[#3478F6]"
				placeholder={t.search}
				onfocus={onSearchFocus}
			>
		</div>
	</header>
	<div class="h-[calc(100%-52px)] overflow-y-auto">
		<div class="px-4 pb-2 pt-4 text-2xl font-bold tracking-tight">{activeView === "sent" ? t.sent : t.inbox}</div>
		{#each inboxEmails as email}
			<button type="button" class="message-row {activeView === 'inbox' ? 'selected' : ''}">
				<div class="flex items-baseline gap-2">
					<span class="truncate text-sm font-semibold">{email.fromName}</span>
					<span class="ml-auto shrink-0 text-xs text-[#6E6E73]">{email.time || todayLabel}</span>
				</div>
				<div class="truncate text-sm font-medium">{email.subject}</div>
				<div class="line-clamp-2 text-xs leading-snug text-[#6E6E73]">{email.preview}</div>
			</button>
		{/each}
		{#if sentMessages.length}
			<div class="px-4 pb-1 pt-4 text-xs font-semibold uppercase text-[#6E6E73]">{t.sent}</div>
			{#each sentMessages as message}
				{@const parsed = parseDraftFromMessage(message.text, t.noSubject)}
				<button type="button" class="message-row {selectedSentId === message.id ? 'selected' : ''}" onclick={() => onSelectSentMessage(message.id)}>
					<div class="flex items-baseline gap-2">
						<span class="truncate text-sm font-semibold">{parsed.to}</span>
						<span class="ml-auto shrink-0 text-xs text-[#6E6E73]">{message.timestamp}</span>
					</div>
					<div class="truncate text-sm font-medium">{parsed.subject || t.noSubject}</div>
					<div class="line-clamp-2 text-xs leading-snug text-[#6E6E73]">{parsed.body}</div>
				</button>
			{/each}
		{/if}
	</div>
</section>

<style>
.message-row {
	display: block;
	width: calc(100% - 16px);
	margin: 0 8px 2px;
	border-radius: 8px;
	padding: 10px 12px;
	text-align: left;
}

.message-row:hover,
.message-row.selected {
	background: #dcecff;
}

:global(.line-clamp-2) {
	display: -webkit-box;
	line-clamp: 2;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
</style>
