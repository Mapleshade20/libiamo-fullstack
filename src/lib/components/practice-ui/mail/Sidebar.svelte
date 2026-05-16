<script lang="ts">
import Archive from "@lucide/svelte/icons/archive";
import Edit3 from "@lucide/svelte/icons/edit-3";
import Inbox from "@lucide/svelte/icons/inbox";
import Send from "@lucide/svelte/icons/send";
import Trash2 from "@lucide/svelte/icons/trash-2";

let {
	showSidebar = false,
	inboxCount = 0,
	sentCount = 0,
	draftCount = 0,
	returnHref = "/",
	t = {} as Record<string, string>,
	onNewMessage = () => {},
	onSelectInbox = () => {},
	onSelectSent = () => {},
	onSelectDraft = () => {},
	onMockAction = () => {},
}: {
	showSidebar?: boolean;
	inboxCount?: number;
	sentCount?: number;
	draftCount?: number;
	returnHref?: string;
	t?: Record<string, string>;
	onNewMessage?: () => void;
	onSelectInbox?: () => void;
	onSelectSent?: () => void;
	onSelectDraft?: () => void;
	onMockAction?: () => void;
} = $props();
</script>

<aside class="mail-sidebar border-r border-black/10 bg-[#E9E9EE]/80 backdrop-blur-xl {showSidebar ? 'is-open' : ''}">
	<div class="flex h-13 items-center gap-2 px-4">
		<a href={returnHref} class="h-3 w-3 rounded-full bg-[#FF5F57] transition-transform hover:scale-110" aria-label="Exit mail practice"></a>
		<span class="h-3 w-3 rounded-full bg-[#FFBD2E]"></span>
		<span class="h-3 w-3 rounded-full bg-[#28C840]"></span>
	</div>
	<div class="px-3 pb-3">
		<button
			type="button"
			class="flex w-full items-center gap-2 rounded-lg bg-[#3478F6] px-3 py-2 text-left text-sm font-semibold text-white shadow-sm hover:bg-[#0A64FF]"
			onclick={onNewMessage}
		>
			<Edit3 size={16} />
			{t.newMessage}
		</button>
	</div>
	<nav class="px-2">
		<p class="px-3 pb-1 text-xs font-semibold uppercase text-[#6E6E73]">{t.mailboxes}</p>
		<button type="button" class="mailbox-row active" onclick={onSelectInbox}>
			<Inbox size={17} />
			<span>{t.inbox}</span>
			<span class="ml-auto">{inboxCount}</span>
		</button>
		<button type="button" class="mailbox-row" onclick={onSelectSent}>
			<Send size={17} />
			<span>{t.sent}</span>
			<span class="ml-auto">{sentCount}</span>
		</button>
		<button type="button" class="mailbox-row" onclick={onSelectDraft}>
			<Edit3 size={17} />
			<span>{t.drafts}</span>
			<span class="ml-auto">{draftCount}</span>
		</button>
		<button type="button" class="mailbox-row" onclick={onMockAction}>
			<Archive size={17} />
			<span>{t.archive}</span>
		</button>
		<button type="button" class="mailbox-row" onclick={onMockAction}>
			<Trash2 size={17} />
			<span>{t.trash}</span>
		</button>
	</nav>
</aside>

<style>
.mailbox-row {
	display: flex;
	width: 100%;
	align-items: center;
	gap: 0.55rem;
	border-radius: 8px;
	padding: 0.42rem 0.7rem;
	font-size: 0.9rem;
	font-weight: 500;
	color: #3a3a3c;
}

.mailbox-row:hover,
.mailbox-row.active {
	background: rgba(255, 255, 255, 0.72);
}
</style>
