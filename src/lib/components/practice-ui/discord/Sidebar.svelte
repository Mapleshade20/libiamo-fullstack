<script lang="ts">
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Hash from "@lucide/svelte/icons/hash";
import LogOut from "@lucide/svelte/icons/log-out";
import Mic from "@lucide/svelte/icons/mic";
import Plus from "@lucide/svelte/icons/plus";
import Settings from "@lucide/svelte/icons/settings";
import { fade } from "svelte/transition";

let {
	serverName = "",
	channelName = "",
	serverAcronym = "",
	userName = "",
	avatarUrl = "",
	taskId = "",
	showMobileMenu = false,
	t = {} as Record<string, string>,
	onCloseMobileMenu = () => {},
	onMockAction = () => {},
}: {
	serverName?: string;
	channelName?: string;
	serverAcronym?: string;
	userName?: string;
	avatarUrl?: string;
	taskId?: string | number;
	showMobileMenu?: boolean;
	t?: Record<string, string>;
	onCloseMobileMenu?: () => void;
	onMockAction?: () => void;
} = $props();
</script>

<div
	class="fixed inset-0 z-[1001] flex md:relative md:flex h-full transition-transform duration-300 md:translate-x-0 {showMobileMenu
		? 'translate-x-0'
		: '-translate-x-full md:translate-x-0'}"
>
	{#if showMobileMenu}
		<div
			role="button"
			tabindex="-1"
			class="fixed inset-0 bg-black/60 md:hidden -z-10"
			style="width: 100vw; height: 100vh;"
			onclick={onCloseMobileMenu}
			onkeydown={(e) => e.key === "Escape" && onCloseMobileMenu()}
			transition:fade={{ duration: 200 }}
		></div>
	{/if}

	<!-- Server Rail Actions -->
	<div class="z-10 flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-[#1E1F22] py-3 hide-scrollbar">
		<a
			href={`/task/${taskId}`}
			class="group relative flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] transition-all hover:rounded-[16px] overflow-hidden shadow-sm text-[#DBDEE1] hover:text-white hover:bg-[#DA373C]"
			title={t.returnTask}
		>
			<LogOut size={22} class="mr-0.5" />
		</a>
		<div class="h-[2px] w-8 rounded-full bg-[#35363C]"></div>
		<button type="button" class="relative flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#5865F2] text-white transition-all">
			<div class="absolute -left-3 top-2 h-8 w-1 rounded-r-full bg-white"></div>
			<span class="text-sm font-medium">{serverAcronym}</span>
		</button>
		<button
			type="button"
			class="flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#23A559] transition-all hover:rounded-[16px] hover:bg-[#23A559] hover:text-white"
			onclick={onMockAction}
		>
			<Plus size={24} />
		</button>
	</div>

	<!-- Channel List Navigation -->
	<div class="z-10 flex w-60 shrink-0 flex-col bg-[#2B2D31]">
		<button
			type="button"
			class="flex h-12 items-center justify-between border-b border-[#1F2023] px-4 font-semibold shadow-sm transition-colors hover:bg-[#35373C]"
			onclick={onMockAction}
		>
			<span class="truncate">{serverName}</span>
			<ChevronDown size={18} />
		</button>
		<div class="flex-1 overflow-y-auto p-2 hide-scrollbar">
			<button
				type="button"
				class="w-full mb-1 mt-4 px-2 text-xs font-semibold text-[#949BA4] hover:text-gray-300 cursor-pointer flex justify-between items-center"
			>
				<span>{t.textChannels}</span>
				<Plus size={14} />
			</button>
			<button type="button" class="flex w-full items-center gap-1.5 rounded bg-[#404249] px-2 py-1.5 text-[#DBDEE1]">
				<Hash size={18} class="text-[#80848E]" />
				<span class="text-sm">{channelName}</span>
			</button>
		</div>
		<!-- User Profile Footer -->
		<div class="flex h-[52px] items-center justify-between bg-[#232428] px-2">
			<button type="button" class="flex items-center gap-2 rounded px-2 py-1 hover:bg-[#35373C] w-full max-w-[140px] truncate" onclick={onMockAction}>
				<div class="relative h-8 w-8 shrink-0">
					<div class="h-full w-full rounded-full bg-[#5865F2] overflow-hidden flex items-center justify-center font-bold text-white">
						{#if avatarUrl}
							<img src={avatarUrl} alt="User" class="h-full w-full object-cover">
						{:else}
							{userName.charAt(0).toUpperCase()}
						{/if}
					</div>
					<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#232428] bg-[#23A559]"></div>
				</div>
				<div class="flex flex-col items-start text-sm truncate">
					<span class="font-semibold leading-tight text-white truncate w-full text-left">{userName}</span>
					<span class="text-xs text-[#949BA4]">{t.online}</span>
				</div>
			</button>
			<div class="flex gap-1 text-[#B5BAC1]">
				<button type="button" class="rounded p-1.5 hover:bg-[#35373C] hover:text-[#DBDEE1]" onclick={onMockAction}><Mic size={18} /></button>
				<button type="button" class="rounded p-1.5 hover:bg-[#35373C] hover:text-[#DBDEE1]" onclick={onMockAction}><Settings size={18} /></button>
			</div>
		</div>
	</div>
</div>

<style>
.hide-scrollbar {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
