<script lang="ts">
import Reply from "@lucide/svelte/icons/reply";
import SquarePen from "@lucide/svelte/icons/square-pen";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { replySubject } from "$lib/practice/mail";
import type { MailText } from "./i18n";
import type { MailItem } from "./mailbox";

let {
	item,
	session,
	language,
	t,
	hidden,
	onReply,
	onCompose,
}: {
	item: MailItem | null;
	session: PracticeSession;
	language: LanguageCode;
	t: MailText;
	/** Hidden on narrow screens while the list is shown. */
	hidden: boolean;
	onReply: (subject: string) => void;
	onCompose: () => void;
} = $props();

const initials = $derived(
	(item?.from.name ?? "")
		.split(/\s+/)
		.map((word) => word.charAt(0))
		.join("")
		.slice(0, 2)
		.toUpperCase(),
);
</script>

<section class="flex min-h-0 flex-col {hidden ? 'max-md:hidden' : ''}">
	{#if item}
		<article class="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-8" aria-labelledby="mail-reader-subject">
			<div class="flex items-start gap-3 border-b border-[#E5E5EA] pb-4">
				<span
					class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#A1A1A6] to-[#8E8E93] text-sm font-semibold text-white"
					aria-hidden="true"
				>
					{initials}
				</span>
				<div class="min-w-0 flex-1">
					<p class="truncate font-semibold">{item.from.name}</p>
					{#if item.to}
						<p class="truncate text-sm text-[#6E6E73]">{t.to} {item.to}</p>
					{/if}
					<h2 id="mail-reader-subject" class="mt-1 text-lg leading-snug font-semibold">{item.subject || t.noSubject}</h2>
				</div>
				<div class="flex shrink-0 flex-col items-end gap-1">
					<span class="text-xs text-[#8E8E93]">{item.time || translate(language, "practice.earlier")}</span>
					{#if item.mailbox === "inbox"}
						<button
							type="button"
							class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium text-[#0A84FF] hover:bg-[#0A84FF]/10 disabled:opacity-40"
							onclick={() => onReply(replySubject(item.subject))}
							disabled={session.disabled}
						>
							<Reply size={16} aria-hidden="true" />
							{t.reply}
						</button>
					{/if}
				</div>
			</div>
			<div class="pt-5 text-[15px] leading-7 break-words whitespace-pre-wrap">{item.body}</div>
		</article>
	{:else}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 p-6">
			<p class="text-lg text-[#AEAEB2]">{t.noSelection}</p>
			<button
				type="button"
				class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#0A84FF] px-4 text-sm font-semibold text-white hover:bg-[#0070E0] disabled:bg-[#C7C7CC]"
				onclick={() => onCompose()}
				disabled={session.disabled}
			>
				<SquarePen size={16} aria-hidden="true" />
				{t.newMessage}
			</button>
		</div>
	{/if}
</section>
