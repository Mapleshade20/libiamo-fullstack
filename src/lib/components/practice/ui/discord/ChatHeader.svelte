<script lang="ts">
import CheckCircle from "@lucide/svelte/icons/check-circle";
import Hash from "@lucide/svelte/icons/hash";
import Users from "@lucide/svelte/icons/users";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import TurnsLeftMobileBadge from "$lib/components/practice/TurnsLeftMobileBadge.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";

let {
	session,
	channelName,
	language,
	showMembers,
	membersLabel,
	onToggleMembers,
}: {
	session: PracticeSession;
	channelName: string;
	language: LanguageCode;
	showMembers: boolean;
	membersLabel: string;
	onToggleMembers: () => void;
} = $props();

const turnsLeft = $derived(t(language, "practice.turnsLeft"));
const turnsColor = $derived((session.remainingTurns ?? 0) <= 2 ? "text-[#DA373C]" : "text-[#23A559]");
</script>

<div class="z-10 flex h-12 shrink-0 items-center justify-between border-b border-[#1F2023] px-4 shadow-sm">
	<div class="flex items-center gap-2 overflow-hidden px-1">
		<Hash size={24} class="shrink-0 text-[#80848E]" aria-hidden="true" />
		<span class="truncate font-semibold text-white">{channelName}</span>
	</div>
	<div class="flex items-center gap-2 text-[#B5BAC1] md:gap-4">
		{#if session.remainingTurns !== null && !session.isCompleted}
			<TurnsLeftMobileBadge
				remainingTurns={session.remainingTurns}
				isCompleted={session.isCompleted}
				label={turnsLeft}
				class="min-h-11 min-w-11 rounded border border-[#1E1F22] bg-[#232428] px-2.5 text-sm font-black shadow-inner {turnsColor}"
			/>
			<div class="hidden items-center gap-2 rounded border border-[#1E1F22] bg-[#232428] px-3 py-1 shadow-inner md:flex">
				<span class="text-xs font-bold tracking-wider text-[#949BA4] uppercase">{turnsLeft}</span>
				<span class="text-sm font-black {turnsColor}">{session.remainingTurns}</span>
			</div>
		{/if}
		{#if !session.isCompleted && session.sessionId}
			<button
				type="button"
				class="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded bg-[#23A559] px-3 text-sm font-medium text-white transition-colors hover:bg-[#1D8749] disabled:opacity-50 md:min-h-8"
				onclick={session.requestFinish}
				disabled={!session.canFinish}
				aria-label={t(language, session.isCompleting ? "practice.finishing" : "practice.finish")}
			>
				<CheckCircle size={16} aria-hidden="true" />
				<span class="hidden sm:inline">{t(language, session.isCompleting ? "practice.finishing" : "practice.finish")}</span>
			</button>
		{/if}
		<button
			type="button"
			class="grid min-h-11 min-w-11 place-items-center rounded transition-colors {showMembers ? 'text-white' : 'hover:text-[#DBDEE1]'}"
			onclick={onToggleMembers}
			aria-label={membersLabel}
			aria-pressed={showMembers}
		>
			<Users size={20} aria-hidden="true" />
		</button>
	</div>
</div>
