<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import Inbox from "@lucide/svelte/icons/inbox";
import Send from "@lucide/svelte/icons/send";
import SquarePen from "@lucide/svelte/icons/square-pen";
import { untrack } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import FinishSheet from "$lib/components/practice/session/FinishSheet.svelte";
import { createPracticeSession, type PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import TurnsLeftMobileBadge from "$lib/components/practice/TurnsLeftMobileBadge.svelte";
import { MAIL_TEXT_MAX_LENGTH } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { formatMailAddress, formatMailMessage, type MailOpeningState, resolveMailCounterpart } from "$lib/practice/mail";
import Composer, { type MailDraftFields } from "./Composer.svelte";
import { i18n } from "./i18n";
import MailList from "./MailList.svelte";
import MailReader from "./MailReader.svelte";
import { buildMailboxes, type Mailbox } from "./mailbox";

let props: PracticeSurfaceProps = $props();

const t = $derived(i18n[props.language] ?? i18n.en);
const opening = $derived((props.openingState ?? {}) as MailOpeningState);
const counterpart = $derived(resolveMailCounterpart(opening, props.taskId));
const session = createPracticeSession(() => props, { fallbackAgentName: () => counterpart.name });
const mailboxes = $derived(buildMailboxes({ opening, messages: session.messages, counterpart, learnerName: props.userName }));
const failedReply = $derived(session.messages.find((message) => message.deliveryState === "failed") ?? null);
const turnsLeft = $derived(translate(props.language, "practice.turnsLeft"));

let mailbox = $state<Mailbox>("inbox");
/** `null` follows the newest email of the mailbox, so a new reply opens by itself. */
let selectedId = $state<string | null>(null);
/** Narrow screens show either the list or one email, like iOS Mail. */
let reading = $state(false);
let draft = $state<MailDraftFields | null>(null);
const read = new SvelteSet<string>(untrack(() => mailboxes.inbox.map((item) => item.id)));

const items = $derived(mailboxes[mailbox]);
/** Replies that arrived since the page opened and were not read yet; shown wherever Inbox is offered. */
const unread = $derived(mailboxes.inbox.filter((item) => !read.has(item.id)).length);
const mailboxLinks = $derived([
	["inbox", Inbox, t.inbox, unread],
	["sent", Send, t.sent, 0],
] as const);
const selected = $derived(items.find((item) => item.id === selectedId) ?? items[0] ?? null);
const draftKey = $derived(`mail-draft:${props.taskId}`);

$effect(() => {
	if (selected && (reading || window.matchMedia("(min-width: 768px)").matches)) read.add(selected.id);
});

function openMailbox(next: Mailbox) {
	mailbox = next;
	selectedId = null;
	reading = false;
}

function loadDraft(): MailDraftFields | null {
	try {
		const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as Partial<MailDraftFields> | null;
		if (!saved || (!saved.subject?.trim() && !saved.body?.trim())) return null;
		return { subject: String(saved.subject ?? ""), body: String(saved.body ?? "").slice(0, MAIL_TEXT_MAX_LENGTH) };
	} catch {
		return null;
	}
}

function storeDraft(value: MailDraftFields | null) {
	try {
		if (value && (value.subject.trim() || value.body.trim())) localStorage.setItem(draftKey, JSON.stringify(value));
		else localStorage.removeItem(draftKey);
	} catch {
		// Storage can be unavailable (private mode); the draft then lives only while the composer is open.
	}
}

/** Opens the composer, resuming an unsent draft before starting a new one. */
function compose(subject = "") {
	draft = loadDraft() ?? { subject, body: "" };
}

async function send(sending: MailDraftFields) {
	draft = null;
	const accepted = await session.send(formatMailMessage({ to: formatMailAddress(counterpart), ...sending }));
	if (accepted) {
		storeDraft(null);
		openMailbox("sent");
	} else {
		draft = sending;
	}
}
</script>

<div class="practice-surface mail-root fixed inset-0 z-[999] h-[100dvh] bg-[#E8E8ED] text-[#1D1D1F] md:p-3 lg:p-5">
	<div
		class="mx-auto flex h-full max-w-[1440px] flex-col overflow-hidden bg-white md:rounded-xl md:border md:border-black/10 md:shadow-[0_24px_64px_rgba(0,0,0,0.14)]"
	>
		<p class="sr-only" aria-live="polite">{unread ? t.unread.replace("{count}", String(unread)) : ""}</p>
		<header class="flex h-[52px] shrink-0 items-center gap-1 border-b border-[#E5E5EA] bg-[#F6F6F8] px-1 md:px-3">
			<a
				href={props.returnHref}
				class="inline-flex min-h-11 items-center justify-center gap-0.5 pr-2 text-[#0A84FF] {reading ? 'max-md:hidden' : ''}"
			>
				<ChevronLeft size={20} aria-hidden="true" />
				<span class="text-sm">{translate(props.language, "practice.returnToTask")}</span>
			</a>
			{#if reading}
				<button
					type="button"
					class="inline-flex min-h-11 items-center justify-center gap-0.5 pr-2 text-[#0A84FF] md:hidden"
					onclick={() => (reading = false)}
				>
					<ChevronLeft size={20} aria-hidden="true" />
					<span class="text-sm">{mailbox === "inbox" ? t.inbox : t.sent}</span>
				</button>
			{/if}
			<div class="flex-1"></div>
			{#if session.remainingTurns !== null && !session.isCompleted}
				<TurnsLeftMobileBadge
					remainingTurns={session.remainingTurns}
					isCompleted={session.isCompleted}
					label={turnsLeft}
					class="inline-flex min-h-11 items-center justify-center min-w-11 rounded-full text-xs font-semibold text-[#6E6E73]"
				/>
				<span class="hidden text-xs text-[#6E6E73] md:inline">{turnsLeft}: {session.remainingTurns}</span>
			{/if}
			{#if !session.isCompleted && session.sessionId}
				<button
					type="button"
					class="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-medium text-[#0A84FF] hover:bg-black/5 disabled:opacity-40"
					onclick={session.requestFinish}
					disabled={!session.canFinish}
				>
					{translate(props.language, session.isCompleting ? "practice.finishing" : "practice.finish")}
				</button>
			{/if}
			<button
				type="button"
				class="inline-flex min-h-11 items-center justify-center w-11 rounded-md text-[#3A3A3C] hover:bg-black/5 disabled:opacity-40"
				onclick={() => compose()}
				disabled={session.disabled}
				aria-label={t.newMessage}
				title={t.newMessage}
			>
				<SquarePen size={19} aria-hidden="true" />
			</button>
		</header>

		<div class="grid min-h-0 flex-1 md:grid-cols-[minmax(260px,320px)_1fr] lg:grid-cols-[200px_minmax(280px,340px)_1fr]">
			<nav class="hidden min-h-0 flex-col gap-0.5 border-r border-[#E5E5EA] bg-[#F2F2F5] p-2 lg:flex" aria-label={t.mailboxes}>
				<p class="px-2 pt-1 pb-1.5 text-[11px] font-semibold text-[#8E8E93]">{t.mailboxes}</p>
				{#each mailboxLinks as [ id, Icon, label, count ]}
					<button
						type="button"
						class="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-sm {mailbox === id ? 'bg-black/[0.08] font-medium' : 'hover:bg-black/[0.04]'}"
						onclick={() => openMailbox(id)}
						aria-current={mailbox === id ? "page" : undefined}
					>
						<Icon size={16} class="text-[#0A84FF]" aria-hidden="true" />
						<span class="flex-1">{label}</span>
						{#if count}
							<span class="text-xs font-semibold text-[#6E6E73]">{count}</span>
						{/if}
					</button>
				{/each}
			</nav>

			<MailList
				{items}
				{mailbox}
				{unread}
				selectedId={selected?.id ?? null}
				{read}
				{failedReply}
				{session}
				language={props.language}
				{t}
				hidden={reading}
				onMailbox={openMailbox}
				onSelect={(id) => {
					selectedId = id;
					reading = true;
				}}
			/>

			<MailReader
				item={selected}
				{session}
				language={props.language}
				{t}
				hidden={!reading}
				onReply={(subject) => compose(subject)}
				onCompose={() => compose()}
			/>
		</div>
	</div>

	{#if draft}
		<Composer
			initial={draft}
			recipient={formatMailAddress(counterpart)}
			{session}
			language={props.language}
			{t}
			onChange={storeDraft}
			onCancel={() => (draft = null)}
			onSend={send}
		/>
	{/if}

	<FinishSheet {session} language={props.language} />
</div>

<style>
/* Global: the composer dialog is portaled out of this component. */
:global(.mail-root) {
	font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Inter, ui-sans-serif, system-ui, sans-serif;
}
:global(.mail-root :is(a, button):focus-visible) {
	outline: 2px solid #0a84ff;
	outline-offset: 2px;
}
</style>
