<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import type { ExchangeController } from "#lib/components/exchange/controller.svelte.ts";
import HintFloatingPanel from "#lib/components/exchange/hint/HintFloatingPanel.svelte";
import { isImeKeyboardEvent } from "#lib/components/exchange/hint/keyboard.ts";
import { TEXT_MAX } from "#lib/exchange/limits.ts";
import { t as translate } from "#lib/i18n/index.svelte.ts";
import type { IMessageText } from "./i18n.ts";

const HINT_OWNER = "imessage-composer";

let { exchange, language, t }: { exchange: ExchangeController; language: string; t: IMessageText } = $props();

let text = $state("");
let fieldBox = $state<HTMLDivElement | null>(null);

const disabled = $derived(exchange.disabled);
const canSend = $derived(Boolean(text.trim()) && !disabled);
const placeholder = $derived(
	exchange.isCompleted
		? translate(language, "exEnded")
		: exchange.limitReached
			? translate(language, "exNoTurns")
			: exchange.isWaitingRetry
				? translate(language, "exRetryFirst")
				: t.messagePlaceholder,
);

async function submit() {
	if (!canSend) return;
	const message = text.slice(0, TEXT_MAX);
	text = "";
	exchange.hint.release(HINT_OWNER);
	if (!(await exchange.send(message)) && !text) text = message;
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
			onclick={(event) => exchange.hint.toggle(HINT_OWNER, event.currentTarget, () => ({ draft: text }))}
			aria-label={translate(language, "exHint")}
			aria-expanded={exchange.hint.isOpen(HINT_OWNER)}
			{disabled}
		>
			<span class="grid h-8 w-8 place-items-center rounded-full border border-[#D1D1D6] bg-white">
				<Lightbulb size={16} class={exchange.hint.loading ? "animate-pulse text-[#FF9F0A]" : ""} aria-hidden="true" />
			</span>
		</button>
		<div bind:this={fieldBox} class="relative min-w-0 flex-1">
			<textarea
				bind:value={text}
				maxlength={TEXT_MAX}
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
				aria-label={translate(language, "exSend")}
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
	{#if exchange.hint.isOpen(HINT_OWNER)}
		<HintFloatingPanel hint={exchange.hint} layoutReference={fieldBox} {language} {disabled} />
	{/if}
</div>
