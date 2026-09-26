<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import HintFloatingPanel from "$lib/components/practice/hint/HintFloatingPanel.svelte";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import { type LanguageCode, PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { newCommentMetadata, type ThreadComment } from "$lib/practice/comment-thread";
import type { Ao3Text } from "./i18n";

const HINT_OWNER = "ao3-comment";

let {
	replyTarget = $bindable(),
	session,
	userName,
	openingState,
	language,
	t,
}: {
	replyTarget: ThreadComment | null;
	session: PracticeSession;
	userName: string;
	openingState: unknown;
	language: LanguageCode;
	t: Ao3Text;
} = $props();

let text = $state("");
let formBox = $state<HTMLDivElement | null>(null);
let textarea = $state<HTMLTextAreaElement | null>(null);

const disabled = $derived(session.disabled);
const placeholder = $derived(
	session.isCompleted
		? translate(language, "practice.sessionEnded")
		: session.limitReached
			? translate(language, "practice.turnLimitReached")
			: session.isWaitingRetry
				? translate(language, "practice.retryFirst")
				: t.leaveComment,
);

/** Brings the form into view and puts the caret in it, e.g. after choosing a comment to reply to. */
export function focus() {
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	formBox?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
	textarea?.focus({ preventScroll: true });
}

async function submit() {
	const body = text.trim();
	if (!body || disabled) return;
	const target = replyTarget;
	text = "";
	replyTarget = null;
	session.hint.release(HINT_OWNER);
	const accepted = await session.send(body, {
		fields: target ? { threadTargetCommentId: target.id } : {},
		thread: (clientMessageId) => newCommentMetadata("ao3", clientMessageId, target, openingState),
	});
	if (!accepted && !text) {
		text = body;
		replyTarget = target;
	}
}
</script>

<div bind:this={formBox} class="mb-8 border border-[#ddd] bg-[#f3efec] p-4 shadow-inner">
	<div class="mb-2 flex items-start justify-between gap-3">
		<div>
			<h3 class="m-0 text-base font-normal">{t.commentAs} <strong>{userName}</strong></h3>
			{#if replyTarget}
				<p class="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-[#666]">
					{t.replyTo} <strong>{replyTarget.author}</strong> ·
					<button type="button" class="ao3-inline-link inline-flex min-h-11 items-center underline md:min-h-0" onclick={() => (replyTarget = null)}>
						{t.cancelReply}
					</button>
				</p>
			{/if}
		</div>
		<p class="m-0 text-xs">{t.plainText}</p>
	</div>
	<textarea
		bind:this={textarea}
		bind:value={text}
		maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
		{placeholder}
		aria-label={t.leaveComment}
		class="box-border h-32 w-full border border-[#ccc] p-2 font-[inherit] focus-visible:outline-2 focus-visible:outline-[#900] disabled:opacity-50"
		onkeydown={(event) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				void submit();
			}
		}}
		{disabled}
	></textarea>
	<div class="mt-2 flex flex-wrap items-center justify-between gap-3">
		<span class="text-xs">{PRACTICE_UI_TEXT_MAX_LENGTH - text.length} {t.charactersLeft}</span>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="ao3-action"
				onclick={(event) =>
					session.hint.toggle(HINT_OWNER, event.currentTarget, () => ({
						draft: text,
						contextPath: replyTarget ? [{ author: replyTarget.author, text: replyTarget.text }] : undefined,
					}))}
				aria-expanded={session.hint.isOpen(HINT_OWNER)}
				{disabled}
			>
				<Lightbulb size={14} class={session.hint.loading ? "animate-pulse text-[#900]" : ""} aria-hidden="true" />
				{translate(language, "practice.hint")}
			</button>
			<button type="button" class="ao3-action" onclick={submit} disabled={!text.trim() || disabled}>{replyTarget ? t.reply : t.comment}</button>
		</div>
	</div>
</div>
{#if session.hint.isOpen(HINT_OWNER)}
	<HintFloatingPanel hint={session.hint} layoutReference={formBox} {language} {disabled} />
{/if}
