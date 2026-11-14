<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import type { ExchangeController } from "#lib/components/exchange/controller.svelte.ts";
import HintFloatingPanel from "#lib/components/exchange/hint/HintFloatingPanel.svelte";
import { newCommentMetadata, type ThreadComment } from "#lib/exchange/comment-thread.ts";
import { TEXT_MAX } from "#lib/exchange/limits.ts";
import { t as translate } from "#lib/i18n/index.svelte.ts";
import type { Ao3Text } from "./i18n.ts";

const HINT_OWNER = "ao3-comment";

let {
	replyTarget = $bindable(),
	exchange,
	userName,
	language,
	t,
}: {
	replyTarget: ThreadComment | null;
	exchange: ExchangeController;
	userName: string;
	language: string;
	t: Ao3Text;
} = $props();

let text = $state("");
let formBox = $state<HTMLDivElement | null>(null);
let textarea = $state<HTMLTextAreaElement | null>(null);

const disabled = $derived(exchange.disabled);
const placeholder = $derived(
	exchange.isCompleted
		? translate(language, "exEnded")
		: exchange.limitReached
			? translate(language, "exNoTurns")
			: exchange.isWaitingRetry
				? translate(language, "exRetryFirst")
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
	exchange.hint.release(HINT_OWNER);
	const accepted = await exchange.send(body, {
		fields: target ? { threadTargetCommentId: target.id } : {},
		thread: (clientMessageId) => newCommentMetadata("ao3", clientMessageId, target),
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
		maxlength={TEXT_MAX}
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
		<span class="text-xs">{TEXT_MAX - text.length} {t.charactersLeft}</span>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="ao3-action"
				onclick={(event) =>
					exchange.hint.toggle(HINT_OWNER, event.currentTarget, () => ({
						draft: text,
						contextPath: replyTarget ? [{ author: replyTarget.author, text: replyTarget.text }] : undefined,
					}))}
				aria-expanded={exchange.hint.isOpen(HINT_OWNER)}
				{disabled}
			>
				<Lightbulb size={14} class={exchange.hint.loading ? "animate-pulse text-[#900]" : ""} aria-hidden="true" />
				{translate(language, "exHint")}
			</button>
			<button type="button" class="ao3-action" onclick={submit} disabled={!text.trim() || disabled}>{replyTarget ? t.reply : t.comment}</button>
		</div>
	</div>
</div>
{#if exchange.hint.isOpen(HINT_OWNER)}
	<HintFloatingPanel hint={exchange.hint} layoutReference={formBox} {language} {disabled} />
{/if}
