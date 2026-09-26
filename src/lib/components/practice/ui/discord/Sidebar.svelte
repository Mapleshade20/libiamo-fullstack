<script lang="ts">
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Hash from "@lucide/svelte/icons/hash";
import LogOut from "@lucide/svelte/icons/log-out";
import Mic from "@lucide/svelte/icons/mic";
import Plus from "@lucide/svelte/icons/plus";
import Settings from "@lucide/svelte/icons/settings";
import { fade, fly } from "svelte/transition";
import type { LanguageCode } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import type { DiscordText } from "./i18n";

let {
	serverName,
	channelName,
	userName,
	avatarUrl,
	returnHref,
	language,
	showMobileMenu,
	t,
	onCloseMobileMenu,
	onMockAction,
}: {
	serverName: string;
	channelName: string;
	userName: string;
	avatarUrl: string;
	returnHref: string;
	language: LanguageCode;
	showMobileMenu: boolean;
	t: DiscordText;
	onCloseMobileMenu: () => void;
	onMockAction: () => void;
} = $props();

const serverAcronym = $derived(
	serverName
		.split(" ")
		.map((word) => word[0])
		.join("")
		.slice(0, 2)
		.toUpperCase(),
);
</script>

{#snippet sidebarContent()}
	<nav class="z-10 flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-[#1E1F22] py-3" aria-label={t.servers}>
		<a
			href={returnHref}
			class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[24px] bg-[#313338] text-[#DBDEE1] shadow-sm transition-all hover:rounded-[16px] hover:bg-[#DA373C] hover:text-white"
			aria-label={translate(language, "practice.returnToTask")}
			title={translate(language, "practice.returnToTask")}
		>
			<LogOut size={22} class="mr-0.5" aria-hidden="true" />
		</a>
		<div class="h-[2px] w-8 rounded-full bg-[#35363C]"></div>
		<div class="relative flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#5865F2] text-white" aria-current="true">
			<div class="absolute top-2 -left-3 h-8 w-1 rounded-r-full bg-white"></div>
			<span class="text-sm font-medium">{serverAcronym}</span>
		</div>
		<button
			type="button"
			class="flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#23A559] transition-all hover:rounded-[16px] hover:bg-[#23A559] hover:text-white"
			onclick={onMockAction}
			aria-label={t.addServer}
		>
			<Plus size={24} aria-hidden="true" />
		</button>
	</nav>

	<div class="z-10 flex w-60 shrink-0 flex-col bg-[#2B2D31]">
		<button
			type="button"
			class="flex h-12 items-center justify-between border-b border-[#1F2023] px-4 font-semibold shadow-sm transition-colors hover:bg-[#35373C]"
			onclick={onMockAction}
		>
			<span class="truncate">{serverName}</span>
			<ChevronDown size={18} aria-hidden="true" />
		</button>
		<div class="flex-1 overflow-y-auto p-2">
			<p class="mt-4 mb-1 px-2 text-xs font-semibold text-[#949BA4]">{t.textChannels}</p>
			<div class="flex w-full items-center gap-1.5 rounded bg-[#404249] px-2 py-1.5 text-[#DBDEE1]" aria-current="page">
				<Hash size={18} class="text-[#80848E]" aria-hidden="true" />
				<span class="text-sm">{channelName}</span>
			</div>
		</div>
		<div class="flex h-[52px] items-center justify-between bg-[#232428] px-2">
			<div class="flex min-w-0 items-center gap-2 px-2 py-1">
				<div class="relative h-8 w-8 shrink-0">
					<div class="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-[#5865F2] font-bold text-white">
						{#if avatarUrl}
							<img src={avatarUrl} alt="" class="h-full w-full object-cover">
						{:else}
							{userName.charAt(0).toUpperCase()}
						{/if}
					</div>
					<div class="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#232428] bg-[#23A559]"></div>
				</div>
				<div class="flex min-w-0 flex-col text-sm">
					<span class="truncate leading-tight font-semibold text-white">{userName}</span>
					<span class="text-xs text-[#949BA4]">{t.online}</span>
				</div>
			</div>
			<div class="flex text-[#B5BAC1]">
				<button
					type="button"
					class="grid h-11 w-9 place-items-center rounded hover:bg-[#35373C] hover:text-[#DBDEE1]"
					onclick={onMockAction}
					aria-label={t.mute}
				>
					<Mic size={18} aria-hidden="true" />
				</button>
				<button
					type="button"
					class="grid h-11 w-9 place-items-center rounded hover:bg-[#35373C] hover:text-[#DBDEE1]"
					onclick={onMockAction}
					aria-label={t.settings}
				>
					<Settings size={18} aria-hidden="true" />
				</button>
			</div>
		</div>
	</div>
{/snippet}

{#if showMobileMenu}
	<button
		type="button"
		class="fixed inset-0 z-[1001] bg-black/60 md:hidden"
		onclick={onCloseMobileMenu}
		aria-label={translate(language, "common.close")}
		transition:fade={{ duration: 150 }}
	></button>
	<div class="fixed inset-y-0 left-0 z-[1002] flex h-full md:hidden" transition:fly={{ x: -312, duration: 250 }}>{@render sidebarContent()}</div>
{/if}

<div class="hidden h-full md:flex">{@render sidebarContent()}</div>
