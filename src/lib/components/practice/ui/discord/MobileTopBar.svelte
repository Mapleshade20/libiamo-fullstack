<script lang="ts">
import Menu from "@lucide/svelte/icons/menu";

let {
	serverName = "",
	onToggleMenu = () => {},
}: {
	serverName: string;
	onToggleMenu?: () => void;
} = $props();
</script>

<div class="flex h-12 w-full shrink-0 items-center justify-between border-b border-[#1F2023] bg-[#2B2D31] px-4 md:hidden">
	<button type="button" onclick={onToggleMenu} class="text-[#B5BAC1] hover:text-white">
		<Menu size={24} />
	</button>
	<span class="font-bold text-white truncate px-4">{serverName}</span>
	<div class="w-6"></div>
</div>
