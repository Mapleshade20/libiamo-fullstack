<script lang="ts">
import PanelLeft from "@lucide/svelte/icons/panel-left";
import Search from "@lucide/svelte/icons/search";
import type { ChatMessage } from "../chatMessages";
import { parseDraftFromMessage } from "./mailUtils";
import type { DraftEmail, NormalizedMailEmail } from "./types";

let {
	inboxEmails = [] as NormalizedMailEmail[],
	sentMessages = [] as ChatMessage[],
	draft = { to: "", subject: "", body: "" } as DraftEmail,
	draftCount = 0,
	selectedInboxId = null as string | null,
	selectedSentId = null as string | null,
	activeView = "inbox",
	todayLabel = "",
	t = {} as Record<string, string>,
	onOpenSidebar = () => {},
	onSearchFocus = () => {},
	onSelectInboxMessage = (_messageId: string) => {},
	onSelectSentMessage = (_messageId: string) => {},
	onSelectDraftMessage = () => {},
}: {
	inboxEmails?: NormalizedMailEmail[];
	sentMessages?: ChatMessage[];
	draft?: DraftEmail;
	draftCount?: number;
	selectedInboxId?: string | null;
	selectedSentId?: string | null;
	activeView?: "inbox" | "sent" | "drafts";
	todayLabel?: string;
	t?: Record<string, string>;
	onOpenSidebar?: () => void;
	onSearchFocus?: () => void;
	onSelectInboxMessage?: (messageId: string) => void;
	onSelectSentMessage?: (messageId: string) => void;
	onSelectDraftMessage?: () => void;
} = $props();

const title = $derived(activeView === "sent" ? t.sent : activeView === "drafts" ? t.drafts : t.inbox);
const draftPreview = $derived(draft.body.trim() || t.composePlaceholder);
</script>

<section class="mail-list border-r border-black/10 bg-[#F7F7F9]">
	<header class="toolbar flex h-13 items-center gap-2 border-b border-black/10 px-3">
		<button type="button" class="icon-button mobile-only" aria-label="Mailboxes" onclick={onOpenSidebar}><PanelLeft size={18} /></button>
		<div class="relative min-w-0 flex-1">
			<Search class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[#8E8E93]" size={15} />
			<input
				class="h-8 w-full rounded-lg border border-black/10 bg-white/80 pl-8 pr-2 text-sm outline-none placeholder:text-[#8E8E93] focus:border-[#3478F6]"
				placeholder={t.search}
				readonly
				aria-readonly="true"
				onfocus={onSearchFocus}
				oninput={(event) => {
					event.currentTarget.value = "";
				}}
			>
		</div>
	</header>
	<div class="h-[calc(100%-52px)] overflow-y-auto">
		<div class="px-4 pb-2 pt-4 text-2xl font-bold tracking-tight">{title}</div>
		{#if activeView === "inbox"}
			{#each inboxEmails as email}
				<button
					type="button"
					class="message-row {selectedInboxId === email.id || (!selectedInboxId && email.id === inboxEmails[0]?.id) ? 'selected' : ''}"
					onclick={() => onSelectInboxMessage(email.id)}
				>
					<div class="flex items-baseline gap-2">
						<span class="truncate text-sm font-semibold">{email.fromName}</span>
						<span class="ml-auto shrink-0 text-xs text-[#6E6E73]">{email.time || todayLabel}</span>
					</div>
					<div class="truncate text-sm font-medium">{email.subject}</div>
					<div class="line-clamp-2 text-xs leading-snug text-[#6E6E73]">{email.preview}</div>
				</button>
			{/each}
		{:else if activeView === "sent" && sentMessages.length}
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
		{:else if activeView === "drafts" && draftCount > 0}
			<div class="px-4 pb-1 pt-4 text-xs font-semibold uppercase text-[#6E6E73]">{t.drafts}</div>
			<button type="button" class="message-row selected" onclick={onSelectDraftMessage}>
				<div class="flex items-baseline gap-2">
					<span class="truncate text-sm font-semibold">{draft.to}</span>
					<span class="ml-auto shrink-0 text-xs text-[#6E6E73]">{todayLabel}</span>
				</div>
				<div class="truncate text-sm font-medium">{draft.subject || t.noSubject}</div>
				<div class="line-clamp-2 text-xs leading-snug text-[#6E6E73]">{draftPreview}</div>
			</button>
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
