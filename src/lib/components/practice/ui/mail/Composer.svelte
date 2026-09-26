<script module lang="ts">
export type MailDraftFields = { subject: string; body: string };
</script>

<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import { Dialog } from "bits-ui";
import { untrack } from "svelte";
import HintFloatingPanel from "$lib/components/practice/hint/HintFloatingPanel.svelte";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import { type LanguageCode, MAIL_TEXT_MAX_LENGTH } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import type { MailText } from "./i18n";

const HINT_OWNER = "mail-composer";

let {
	initial,
	recipient,
	session,
	language,
	t,
	onChange,
	onCancel,
	onSend,
}: {
	initial: MailDraftFields;
	recipient: string;
	session: PracticeSession;
	language: LanguageCode;
	t: MailText;
	onChange: (draft: MailDraftFields) => void;
	onCancel: () => void;
	onSend: (draft: MailDraftFields) => void;
} = $props();

let subject = $state(untrack(() => initial.subject));
let body = $state(untrack(() => initial.body));
/** The hint panel opens just above the toolbar, over the end of the body. */
let toolbar = $state<HTMLDivElement | null>(null);
let bodyField = $state<HTMLTextAreaElement | null>(null);

const disabled = $derived(session.disabled);
const canSend = $derived(Boolean(body.trim()) && !disabled);
const placeholder = $derived(
	session.isCompleted
		? translate(language, "practice.sessionEnded")
		: session.limitReached
			? translate(language, "practice.turnLimitReached")
			: session.isWaitingRetry
				? translate(language, "practice.retryFirst")
				: t.composePlaceholder,
);

function close() {
	session.hint.release(HINT_OWNER);
	onCancel();
}

function send() {
	if (!canSend) return;
	session.hint.release(HINT_OWNER);
	onSend({ subject: subject.trim(), body });
}

// Escape first closes an open hint panel; only a second Escape closes the composer. This capture
// listener registers before the panel's, so it sees whether the panel was open.
let hintOpenAtEscape = false;
</script>

<svelte:window
	onkeydowncapture={(event) => {
		if (event.key === "Escape") hintOpenAtEscape = session.hint.owner !== null;
	}}
/>

<Dialog.Root open onOpenChange={(open) => !open && close()}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-[1100] bg-black/15" />
		<Dialog.Content
			class="practice-surface mail-root fixed inset-x-0 bottom-0 z-[1100] flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden rounded-t-2xl bg-white text-[#1D1D1F] shadow-[0_24px_64px_rgba(0,0,0,0.25)] outline-none md:inset-0 md:m-auto md:h-[min(640px,85dvh)] md:w-[min(42rem,calc(100vw-3rem))] md:rounded-xl md:border md:border-black/10"
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				bodyField?.focus({ preventScroll: true });
			}}
			onEscapeKeydown={(event) => {
				if (hintOpenAtEscape) event.preventDefault();
			}}
		>
			<div class="flex h-[52px] shrink-0 items-center gap-2 border-b border-[#E5E5EA] bg-[#F6F6F8] px-2">
				<button
					type="button"
					class="inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm text-[#0A84FF] hover:bg-black/5"
					onclick={close}
				>
					{t.cancel}
				</button>
				<Dialog.Title class="min-w-0 flex-1 truncate text-center text-sm font-semibold">{subject.trim() || t.newMessage}</Dialog.Title>
				<button
					type="button"
					class="inline-flex min-h-11 items-center justify-center rounded-full bg-[#0A84FF] px-4 text-sm font-semibold text-white hover:bg-[#0070E0] disabled:bg-[#C7C7CC]"
					onclick={send}
					disabled={!canSend}
				>
					{translate(language, "practice.send")}
				</button>
			</div>

			<div class="flex min-h-11 items-center gap-2 border-b border-[#E5E5EA] px-4 text-sm">
				<span class="text-[#8E8E93]">{t.to}</span>
				<span class="min-w-0 truncate rounded-full bg-[#E8F1FE] px-2 py-0.5 text-[#0A5CC2]">{recipient}</span>
			</div>
			<label class="flex min-h-11 items-center gap-2 border-b border-[#E5E5EA] px-4 text-sm">
				<span class="text-[#8E8E93]">{t.subject}</span>
				<input
					bind:value={subject}
					class="min-w-0 flex-1 bg-transparent py-2 outline-none"
					maxlength={200}
					oninput={() => onChange({ subject, body })}
					{disabled}
				>
			</label>

			<div class="relative flex min-h-0 flex-1 flex-col">
				<textarea
					bind:this={bodyField}
					bind:value={body}
					maxlength={MAIL_TEXT_MAX_LENGTH}
					class="min-h-0 flex-1 resize-none px-4 py-3 text-[15px] leading-6 outline-none placeholder:text-[#AEAEB2]"
					aria-label={t.composePlaceholder}
					{placeholder}
					oninput={() => onChange({ subject, body })}
					onkeydown={(event) => {
						if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
							event.preventDefault();
							send();
						}
					}}
					{disabled}
				></textarea>
				<div bind:this={toolbar} class="flex shrink-0 items-center border-t border-[#F2F2F7] px-2 pb-[env(safe-area-inset-bottom)]">
					<button
						type="button"
						class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-[#6E6E73] hover:bg-black/5 disabled:opacity-40"
						onclick={(event) => session.hint.toggle(HINT_OWNER, event.currentTarget, () => ({ draft: body }))}
						aria-expanded={session.hint.isOpen(HINT_OWNER)}
						disabled={disabled || !session.sessionId}
					>
						<Lightbulb size={16} class={session.hint.loading ? "animate-pulse text-[#FF9F0A]" : ""} aria-hidden="true" />
						{translate(language, "practice.hint")}
					</button>
				</div>
			</div>
			{#if session.hint.isOpen(HINT_OWNER)}
				<HintFloatingPanel hint={session.hint} layoutReference={toolbar} {language} {disabled} placement="above" />
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
