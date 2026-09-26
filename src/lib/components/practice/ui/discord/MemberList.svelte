<script lang="ts">
import { fade, fly } from "svelte/transition";
import type { DiscordText } from "./i18n";
import { type DiscordMember, memberColor } from "./members";

let {
	agent,
	online,
	offline,
	userName,
	avatarUrl,
	t,
	onClose,
	onMention,
}: {
	agent: DiscordMember;
	online: DiscordMember[];
	offline: DiscordMember[];
	userName: string;
	avatarUrl: string;
	t: DiscordText;
	onClose: () => void;
	onMention: (event: MouseEvent, member: DiscordMember) => void;
} = $props();
</script>

<div role="none" class="fixed inset-0 z-[1001] bg-black/40 xl:hidden" onclick={onClose} transition:fade={{ duration: 150 }}></div>

<aside
	class="fixed inset-y-0 right-0 z-[1002] flex w-60 flex-col border-l border-[#26272B] bg-[#2B2D31] shadow-2xl xl:static xl:z-0 xl:shadow-none"
	aria-label={t.members}
	transition:fly={{ x: 240, duration: 250 }}
>
	<div class="flex-1 overflow-y-auto px-2 py-4">
		<h3 class="px-2 pt-2 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{t.online} — {online.length + 2}</h3>
		<div class="mt-0.5 flex items-center gap-3 rounded px-2 py-1.5">
			<div class="relative h-8 w-8 shrink-0">
				<div
					class="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#5865F2] text-sm font-bold text-white shadow-inner"
				>
					{#if avatarUrl}
						<img src={avatarUrl} alt="" class="h-full w-full object-cover">
					{:else}
						{userName.charAt(0).toUpperCase()}
					{/if}
				</div>
				<div class="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
			</div>
			<span class="truncate text-sm font-medium text-[#DBDEE1]">{userName}</span>
		</div>
		{#each [agent, ...online] as member (member.name)}
			{@render memberRow(member, true)}
		{/each}

		<h3 class="px-2 pt-6 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{t.offline} — {offline.length}</h3>
		{#each offline as member (member.name)}
			{@render memberRow(member, false)}
		{/each}
	</div>
</aside>

{#snippet memberRow(member: DiscordMember, isOnline: boolean)}
	<button
		type="button"
		class="mt-0.5 flex w-full items-center gap-3 rounded px-2 py-1.5 text-left transition-colors hover:bg-[#35373C] {isOnline ? '' : 'opacity-50 hover:opacity-100'}"
		oncontextmenu={(event) => onMention(event, member)}
		onclick={(event) => {
			event.stopPropagation();
			onMention(event, member);
		}}
	>
		<div class="relative h-8 w-8 shrink-0">
			<div
				class="flex h-full w-full items-center justify-center rounded-full text-sm font-bold text-white uppercase {memberColor(member.name)}"
				aria-hidden="true"
			>
				{member.name.charAt(0)}
			</div>
			{#if isOnline}
				<div class="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
			{/if}
		</div>
		<div class="flex min-w-0 flex-col justify-center">
			<span class="truncate text-sm font-medium {isOnline ? 'text-[#DBDEE1]' : 'text-[#80848E]'}">{member.name}</span>
			{#if isOnline}
				<span class="truncate text-xs text-[#B5BAC1]">{member.status}</span>
			{/if}
		</div>
	</button>
{/snippet}
