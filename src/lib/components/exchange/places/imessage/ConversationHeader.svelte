<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import type { ExchangeController } from "#lib/components/exchange/controller.svelte.ts";
import TurnsLeftMobileBadge from "#lib/components/exchange/TurnsLeftMobileBadge.svelte";

import { t as translate } from "#lib/i18n/index.svelte.ts";
import type { IMessageText } from "./i18n.ts";

let {
	exchange,
	title,
	returnHref,
	language,
	t,
}: { exchange: ExchangeController /** The contact or group name. */; title: string; returnHref: string; language: string; t: IMessageText } =
	$props();

const turnsLeft = $derived(translate(language, "exTurnsLeft"));
</script>

<header class="relative flex h-14 shrink-0 items-center justify-between border-b border-[#E5E5EA] bg-white px-2 md:px-4">
	<a href={returnHref} class="flex min-h-11 items-center gap-1 pr-2 text-[#0A84FF] md:hidden" aria-label={translate(language, "exBack")}>
		<ChevronLeft size={22} aria-hidden="true" />
		<span class="text-sm">{t.back}</span>
	</a>
	<h1 class="absolute left-1/2 max-w-[40%] -translate-x-1/2 truncate text-center text-sm font-semibold text-[#1C1C1E]">{title}</h1>
	<div class="ml-auto flex items-center gap-2">
		{#if exchange.remainingTurns !== null && !exchange.isCompleted}
			<TurnsLeftMobileBadge
				remainingTurns={exchange.remainingTurns}
				isCompleted={exchange.isCompleted}
				label={turnsLeft}
				class="min-h-11 min-w-11 rounded-full bg-[#E5E5EA] px-2.5 text-xs font-semibold text-[#8E8E93]"
			/>
			<span class="hidden text-xs text-[#8E8E93] md:inline">{turnsLeft}: {exchange.remainingTurns}</span>
		{/if}
		{#if !exchange.isCompleted && exchange.exchangeId}
			<button
				type="button"
				class="min-h-11 rounded-full px-3 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-[#EAF2FF] disabled:opacity-50 md:min-h-8 md:bg-[#0A84FF] md:text-white md:hover:bg-[#0062CC]"
				onclick={exchange.requestFinish}
				disabled={!exchange.canFinish}
			>
				{translate(language, exchange.isCompleting ? "exFinishing" : "exFinish")}
			</button>
		{/if}
	</div>
</header>
