<script lang="ts">
import Menu from "@lucide/svelte/icons/menu";

let { serverName, menuLabel, onToggleMenu }: { serverName: string; menuLabel: string; onToggleMenu: () => void } = $props();
</script>

<div class="flex h-12 w-full shrink-0 items-center justify-between border-b border-[#1F2023] bg-[#2B2D31] px-1 md:hidden">
	<button type="button" onclick={onToggleMenu} class="grid h-11 w-11 place-items-center text-[#B5BAC1] hover:text-white" aria-label={menuLabel}>
		<Menu size={24} aria-hidden="true" />
	</button>
	<span class="truncate px-4 font-bold text-white">{serverName}</span>
	<div class="w-11"></div>
</div>
