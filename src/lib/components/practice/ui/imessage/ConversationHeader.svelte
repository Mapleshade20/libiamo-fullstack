<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import TurnsLeftMobileBadge from "$lib/components/practice/TurnsLeftMobileBadge.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import type { IMessageText } from "./i18n";

let { session, returnHref, language, t }: { session: PracticeSession; returnHref: string; language: LanguageCode; t: IMessageText } = $props();

const turnsLeft = $derived(translate(language, "practice.turnsLeft"));
</script>

<header class="relative flex h-14 shrink-0 items-center justify-between border-b border-[#E5E5EA] bg-white px-2 md:px-4">
	<a
		href={returnHref}
		class="flex min-h-11 items-center gap-1 pr-2 text-[#0A84FF] md:hidden"
		aria-label={translate(language, "practice.returnToTask")}
	>
		<ChevronLeft size={22} aria-hidden="true" />
		<span class="text-sm">{t.back}</span>
	</a>
	<h1 class="absolute left-1/2 max-w-[40%] -translate-x-1/2 truncate text-center text-sm font-semibold text-[#1C1C1E]">{session.agentName}</h1>
	<div class="ml-auto flex items-center gap-2">
		{#if session.remainingTurns !== null && !session.isCompleted}
			<TurnsLeftMobileBadge
				remainingTurns={session.remainingTurns}
				isCompleted={session.isCompleted}
				label={turnsLeft}
				class="min-h-11 min-w-11 rounded-full bg-[#E5E5EA] px-2.5 text-xs font-semibold text-[#8E8E93]"
			/>
			<span class="hidden text-xs text-[#8E8E93] md:inline">{turnsLeft}: {session.remainingTurns}</span>
		{/if}
		{#if !session.isCompleted && session.sessionId}
			<button
				type="button"
				class="min-h-11 rounded-full px-3 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-[#EAF2FF] disabled:opacity-50 md:min-h-8 md:bg-[#0A84FF] md:text-white md:hover:bg-[#0062CC]"
				onclick={session.requestFinish}
				disabled={!session.canFinish}
			>
				{translate(language, session.isCompleting ? "practice.finishing" : "practice.finish")}
			</button>
		{/if}
	</div>
</header>
