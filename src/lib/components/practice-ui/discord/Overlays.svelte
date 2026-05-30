<script lang="ts">
import Info from "@lucide/svelte/icons/info";
import { fade } from "svelte/transition";
import type { ChatUser } from "./types";

let {
	contextMenu = { show: false, x: 0, y: 0, targetUser: null as ChatUser | null },
	showToast = false,
	t = {} as Record<string, string>,
	onContextMenuMention = () => {},
}: {
	contextMenu?: { show: boolean; x: number; y: number; targetUser: ChatUser | null };
	showToast?: boolean;
	t?: Record<string, string>;
	onContextMenuMention?: () => void;
} = $props();
</script>

{#if contextMenu.show && contextMenu.targetUser}
	<div
		class="fixed z-[1000] bg-[#111214] border border-[#1E1F22] rounded shadow-lg py-1 w-48 text-sm text-[#DBDEE1]"
		style="top: {contextMenu.y}px; left: {contextMenu.x}px;"
	>
		<button type="button" class="w-full text-left px-3 py-1.5 hover:bg-[#5865F2] hover:text-white transition-colors" onclick={onContextMenuMention}>
			Mention @{contextMenu.targetUser.name}
		</button>
	</div>
{/if}

{#if showToast}
	<div
		transition:fade={{ duration: 150 }}
		class="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md bg-[#111214] px-4 py-3 text-sm font-medium text-white shadow-xl border border-[#1E1F22] z-[1000]"
	>
		<Info size={18} class="text-[#5865F2]" />
		{t.unavailableFeature}
	</div>
{/if}
