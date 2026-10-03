<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import HintFloatingPanel from "$lib/components/practice/hint/HintFloatingPanel.svelte";
import { isImeKeyboardEvent } from "$lib/components/practice/hint/keyboard";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import { type LanguageCode, PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import type { IMessageText } from "./i18n";

const HINT_OWNER = "imessage-composer";

let { session, language, t }: { session: PracticeSession; language: LanguageCode; t: IMessageText } = $props();

let text = $state("");
let fieldBox = $state<HTMLDivElement | null>(null);

const disabled = $derived(session.disabled);
const canSend = $derived(Boolean(text.trim()) && !disabled);
const placeholder = $derived(
	session.isCompleted
		? translate(language, "practice.sessionEnded")
		: session.limitReached
			? translate(language, "practice.turnLimitReached")
			: session.isWaitingRetry
				? translate(language, "practice.retryFirst")
				: t.messagePlaceholder,
);

async function submit() {
	if (!canSend) return;
	const message = text.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);
	text = "";
	session.hint.release(HINT_OWNER);
	if (!(await session.send(message)) && !text) text = message;
}

function handleKeydown(event: KeyboardEvent) {
	if (isImeKeyboardEvent(event) || event.key !== "Enter" || event.shiftKey) return;
	if (window.matchMedia("(max-width: 768px)").matches) return;
	event.preventDefault();
	void submit();
}
</script>

<div class="shrink-0 border-t border-[#E5E5EA] bg-white px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-6 md:py-3">
	<div class="flex items-end gap-1">
		<button
			type="button"
			class="grid h-11 w-11 shrink-0 place-items-center text-[#8E8E93] transition-colors hover:text-[#1C1C1E] disabled:opacity-50"
			onclick={(event) => session.hint.toggle(HINT_OWNER, event.currentTarget, () => ({ draft: text }))}
			aria-label={translate(language, "practice.hint")}
			aria-expanded={session.hint.isOpen(HINT_OWNER)}
			{disabled}
		>
			<span class="grid h-8 w-8 place-items-center rounded-full border border-[#D1D1D6] bg-white">
				<Lightbulb size={16} class={session.hint.loading ? "animate-pulse text-[#FF9F0A]" : ""} aria-hidden="true" />
			</span>
		</button>
		<div bind:this={fieldBox} class="relative min-w-0 flex-1">
			<textarea
				bind:value={text}
				maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
				rows="1"
				class="block max-h-40 min-h-11 w-full resize-none rounded-[22px] border border-[#D1D1D6] bg-white py-2.5 pr-12 pl-4 text-[15px] leading-5 [field-sizing:content] outline-none placeholder:text-[#8E8E93] focus:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/25"
				aria-label={t.messagePlaceholder}
				{placeholder}
				onkeydown={handleKeydown}
				{disabled}
			></textarea>
			<button
				type="button"
				class="group absolute right-0 bottom-0 grid h-11 w-11 place-items-center"
				aria-label={translate(language, "practice.send")}
				onclick={submit}
				disabled={!canSend}
			>
				<span
					class="grid h-8 w-8 place-items-center rounded-full bg-[#0A84FF] text-white transition-colors group-hover:bg-[#0062CC] group-disabled:bg-[#D1D1D6] md:bg-[#34C759] md:group-hover:bg-[#2DAE4F] md:group-disabled:bg-[#D1D1D6]"
				>
					<ArrowUp size={16} aria-hidden="true" />
				</span>
			</button>
		</div>
	</div>
	{#if session.hint.isOpen(HINT_OWNER)}
		<HintFloatingPanel hint={session.hint} layoutReference={fieldBox} {language} {disabled} />
	{/if}
</div>
