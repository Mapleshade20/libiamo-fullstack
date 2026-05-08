<script lang="ts">
import { fade, fly } from "svelte/transition";
import type { ChatUser } from "./types";

let {
	onlineUsers = [] as ChatUser[],
	offlineUsers = [] as ChatUser[],
	agentUser,
	userName = "",
	avatarUrl = "",
	onlineLabel = "Online",
	offlineLabel = "Offline",
	onCloseMembers = () => {},
	onContextMenu = (_e: MouseEvent, _user: ChatUser) => {},
}: {
	onlineUsers?: ChatUser[];
	offlineUsers?: ChatUser[];
	agentUser: ChatUser;
	userName?: string;
	avatarUrl?: string;
	onlineLabel?: string;
	offlineLabel?: string;
	onCloseMembers?: () => void;
	onContextMenu?: (e: MouseEvent, user: ChatUser) => void;
} = $props();
</script>

<!-- Overlay for mobile view -->
<div role="none" class="fixed inset-0 z-[1001] bg-black/40 xl:hidden" onclick={onCloseMembers} transition:fade={{ duration: 150 }}></div>

<!-- Sidebar container -->
<div
	class="fixed inset-y-0 right-0 z-[1002] flex w-60 flex-col bg-[#2B2D31] border-l border-[#26272B] shadow-2xl xl:shadow-none xl:static xl:z-0 xl:translate-x-0"
	transition:fly={{ x: 240, duration: 250 }}
>
	<div class="flex-1 overflow-y-auto px-2 py-4 hide-scrollbar">
		<!-- Online Header -->
		<h3 class="px-2 pt-2 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{onlineLabel} — {onlineUsers.length + 2}</h3>

		<!-- Current User Item -->
		<div class="flex items-center gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded mt-0.5 opacity-100 transition-colors cursor-default">
			<div class="relative h-8 w-8 shrink-0">
				<div
					class="h-full w-full rounded-full bg-[#5865F2] overflow-hidden flex items-center justify-center font-bold text-white shadow-inner text-sm"
				>
					{#if avatarUrl}
						<img src={avatarUrl} alt="User" class="h-full w-full object-cover">
					{:else}
						{userName.charAt(0).toUpperCase()}
					{/if}
				</div>
				<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
			</div>
			<span class="text-[#DBDEE1] font-medium text-sm truncate">{userName} (You)</span>
		</div>

		<!-- Bot / Agent Item -->
		<button
			type="button"
			class="flex w-full items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 transition-colors"
			oncontextmenu={(e) => onContextMenu(e, agentUser)}
		>
			<div class="relative h-8 w-8 shrink-0">
				<div class="h-full w-full rounded-full {agentUser.color} flex items-center justify-center font-bold text-white uppercase text-sm">
					{agentUser.name.charAt(0)}
				</div>
				<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
			</div>
			<div class="flex flex-col justify-center min-w-0">
				<div class="flex items-center gap-1">
					<span class="text-[#DBDEE1] font-medium text-sm truncate">{agentUser.name}</span>
					<span class="text-[9px] bg-[#5865F2] text-white px-1 rounded font-bold uppercase tracking-wide leading-tight">Bot</span>
				</div>
				<span class="text-xs text-[#B5BAC1] truncate">{agentUser.status}</span>
			</div>
		</button>

		<!-- Online Others -->
		{#each onlineUsers as user (user.name)}
			<button
				type="button"
				class="flex w-full items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 transition-colors"
				oncontextmenu={(e) => onContextMenu(e, user)}
			>
				<div class="relative h-8 w-8 shrink-0">
					<div class="h-full w-full rounded-full {user.color} flex items-center justify-center font-bold text-white uppercase text-sm">
						{user.name.charAt(0)}
					</div>
					<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
				</div>
				<div class="flex flex-col justify-center min-w-0">
					<span class="text-[#DBDEE1] font-medium text-sm truncate">{user.name}</span>
					<span class="text-xs text-[#B5BAC1] truncate">{user.status}</span>
				</div>
			</button>
		{/each}

		<!-- Offline Header -->
		<h3 class="px-2 pt-6 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{offlineLabel} — {offlineUsers.length}</h3>
		{#each offlineUsers as user (user.name)}
			<button
				type="button"
				class="flex w-full items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 opacity-50 hover:opacity-100 transition-all font-medium"
				oncontextmenu={(e) => onContextMenu(e, user)}
			>
				<div class="relative h-8 w-8 shrink-0">
					<div class="h-full w-full rounded-full {user.color} flex items-center justify-center font-bold text-white uppercase text-sm">
						{user.name.charAt(0)}
					</div>
				</div>
				<span class="text-[#80848E] text-sm truncate ml-3">{user.name}</span>
			</button>
		{/each}
	</div>
</div>
