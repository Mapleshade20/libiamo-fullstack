<script lang="ts">
import Bell from "@lucide/svelte/icons/bell";
import Menu from "@lucide/svelte/icons/menu";
import Plus from "@lucide/svelte/icons/plus";
import Search from "@lucide/svelte/icons/search";
import Video from "@lucide/svelte/icons/video";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import TurnsLeftMobileBadge from "$lib/components/practice/TurnsLeftMobileBadge.svelte";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import type { RedditText } from "./i18n";

let {
	session,
	language,
	t,
	onMockAction,
	onToggleMobileMenu,
}: {
	session: PracticeSession;
	language: LanguageCode;
	t: RedditText;
	onMockAction: () => void;
	onToggleMobileMenu: () => void;
} = $props();

const turnsLeft = $derived(translate(language, "practice.turnsLeft"));
const tools = $derived([
	[Plus, t.create],
	[Video, t.live],
	[Bell, t.notifications],
] as const);
</script>

<header class="z-20 flex h-12 shrink-0 items-center gap-2 border-b border-[#EDEFF1] bg-white px-1 md:px-3">
	<button
		type="button"
		class="grid h-11 w-11 place-items-center rounded-md text-[#878A8C] hover:bg-[#F6F7F8] md:hidden"
		onclick={onToggleMobileMenu}
		aria-label={t.menu}
	>
		<Menu size={20} aria-hidden="true" />
	</button>

	<span class="shrink-0 font-bold text-[#1C1C1C]">reddit</span>

	<div class="mx-auto hidden w-full max-w-[480px] md:block">
		<button
			type="button"
			class="flex w-full items-center gap-2 rounded-full border border-[#EDEFF1] bg-[#F6F7F8] py-1.5 pr-4 pl-3 text-sm text-[#878A8C] hover:border-[#0079D3] hover:bg-white"
			onclick={onMockAction}
		>
			<Search size={14} aria-hidden="true" />
			<span>{t.searchReddit}</span>
		</button>
	</div>

	<div class="ml-auto flex shrink-0 items-center gap-1">
		{#each tools as [ Icon, label ]}
			<button
				type="button"
				class="hidden h-8 w-8 items-center justify-center rounded-md text-[#878A8C] hover:bg-[#F6F7F8] lg:flex"
				onclick={onMockAction}
				aria-label={label}
			>
				<Icon size={18} aria-hidden="true" />
			</button>
		{/each}

		{#if session.remainingTurns !== null && !session.isCompleted}
			<TurnsLeftMobileBadge
				remainingTurns={session.remainingTurns}
				isCompleted={session.isCompleted}
				label={turnsLeft}
				class="min-h-11 min-w-11 rounded-full border border-[#EDEFF1] bg-[#F6F7F8] px-2.5 text-xs font-bold text-[#1C1C1C]"
			/>
			<span class="hidden text-xs text-[#878A8C] md:inline">
				{turnsLeft}: <strong class={session.remainingTurns <= 2 ? "text-[#FF4500]" : "text-[#1C1C1C]"}>{session.remainingTurns}</strong>
			</span>
		{/if}

		{#if !session.isCompleted && session.sessionId}
			<button
				type="button"
				class="ml-1 min-h-11 rounded-full bg-[#FF4500] px-3 text-xs font-bold text-white transition-colors hover:bg-[#CC3700] disabled:opacity-50 md:min-h-8"
				onclick={session.requestFinish}
				disabled={!session.canFinish}
			>
				{translate(language, session.isCompleting ? "practice.finishing" : "practice.finish")}
			</button>
		{/if}
	</div>
</header>
