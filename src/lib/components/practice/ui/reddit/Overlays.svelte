<script lang="ts">
import Info from "@lucide/svelte/icons/info";
import { fade } from "svelte/transition";

let {
	showToast = false,
	t = {} as Record<string, string>,
}: {
	showToast?: boolean;
	t?: Record<string, string>;
} = $props();
</script>

<!-- Toast notification -->
{#if showToast}
	<div
		transition:fade={{ duration: 150 }}
		class="fixed top-16 left-1/2 z-[2000] -translate-x-1/2 flex items-center gap-2 rounded-md border border-[#EDEFF1] bg-white px-4 py-3 text-sm font-medium text-[#1C1C1C] shadow-xl"
	>
		<Info size={16} class="shrink-0 text-[#0079D3]" />
		{t.unavailableFeature}
	</div>
{/if}
