<script lang="ts">
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import type { ChatMessage } from "$lib/practice/messages";
import type { MailText } from "./i18n";
import type { Mailbox, MailItem } from "./mailbox";

let {
	items,
	mailbox,
	unread,
	selectedId,
	read,
	failedReply,
	session,
	language,
	t,
	hidden,
	onMailbox,
	onSelect,
}: {
	items: MailItem[];
	mailbox: Mailbox;
	unread: number;
	selectedId: string | null;
	read: Set<string>;
	failedReply: ChatMessage | null;
	session: PracticeSession;
	language: LanguageCode;
	t: MailText;
	/** Hidden on narrow screens while an email is open. */
	hidden: boolean;
	onMailbox: (mailbox: Mailbox) => void;
	onSelect: (id: string) => void;
} = $props();

const segments = $derived([
	["inbox", t.inbox],
	["sent", t.sent],
] as const);
</script>

<section class="flex min-h-0 flex-col border-r border-[#E5E5EA] {hidden ? 'max-md:hidden' : ''}" aria-labelledby="mail-list-title">
	<div class="shrink-0 px-4 pt-3 pb-2">
		<h1 id="mail-list-title" class="text-2xl font-bold tracking-tight">{mailbox === "inbox" ? t.inbox : t.sent}</h1>
		<div class="mt-2 grid grid-cols-2 rounded-lg bg-[#EEEEF0] p-0.5 text-sm lg:hidden" role="group" aria-label={t.mailboxes}>
			{#each segments as [ id, label ]}
				<button
					type="button"
					class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md {mailbox === id ? 'bg-white font-medium shadow-sm' : 'text-[#6E6E73]'}"
					onclick={() => onMailbox(id)}
					aria-pressed={mailbox === id}
				>
					{label}
					{#if id === "inbox" && unread}
						<span
							class="min-w-5 rounded-full bg-[#0A84FF] px-1.5 text-xs leading-5 font-semibold text-white"
							aria-label={t.unread.replace("{count}", String(unread))}
						>
							{unread}
						</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	{#if failedReply}
		<div class="mx-3 mb-2 flex items-center gap-3 rounded-lg border border-[#FF3B30]/25 bg-[#FFF3F2] px-3 py-2 text-sm text-[#B42318]" role="alert">
			<p class="min-w-0 flex-1">{failedReply.error || translate(language, "practice.replyFailed")}</p>
			<button
				type="button"
				class="inline-flex min-h-11 items-center justify-center shrink-0 rounded-md px-3 font-semibold text-[#0A84FF] hover:bg-white disabled:opacity-40"
				onclick={() => session.retry(failedReply.id)}
				disabled={session.isSubmitting}
			>
				{translate(language, "practice.retry")}
			</button>
		</div>
	{/if}

	{#if items.length === 0}
		<p class="flex flex-1 items-center justify-center p-6 text-sm text-[#8E8E93]">{t.noMessages}</p>
	{:else}
		<ul class="min-h-0 flex-1 overflow-y-auto">
			{#each items as item (item.id)}
				{@const active = item.id === selectedId}
				{@const unread = item.mailbox === "inbox" && !read.has(item.id)}
				<li class="border-b border-[#F0F0F2] px-2">
					<button
						type="button"
						class="my-1 grid w-full grid-cols-[12px_1fr_auto] gap-x-2 rounded-lg px-2 py-2 text-left {active ? 'md:bg-[#0A84FF] md:text-white' : ''} hover:bg-black/[0.03]"
						onclick={() => onSelect(item.id)}
						aria-current={active ? "true" : undefined}
					>
						<span
							class="mt-1.5 h-2 w-2 rounded-full {unread ? (active ? 'bg-[#0A84FF] md:bg-white' : 'bg-[#0A84FF]') : ''}"
							aria-hidden="true"
						></span>
						<span class="truncate text-sm font-semibold">{item.mailbox === "sent" ? `${t.to} ${item.to}` : item.from.name}</span>
						<span class="text-xs text-[#8E8E93] {active ? 'md:text-white/80' : ''}">{item.time || translate(language, "practice.earlier")}</span>
						<span class="col-start-2 col-end-4 truncate text-sm">{item.subject || t.noSubject}</span>
						<span class="col-start-2 col-end-4 line-clamp-2 text-[13px] leading-snug text-[#6E6E73] {active ? 'md:text-white/80' : ''}"
							>{item.body}</span
						>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
