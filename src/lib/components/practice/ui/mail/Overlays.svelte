<script lang="ts">
import Info from "@lucide/svelte/icons/info";
import { fly } from "svelte/transition";

let {
	showToast = false,
	t = {} as Record<string, string>,
}: {
	showToast?: boolean;
	t?: Record<string, string>;
} = $props();
</script>

{#if showToast}
	<div
		transition:fly={{ y: -8, duration: 150 }}
		class="absolute left-1/2 top-6 z-[1500] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[#1D1D1F] shadow-xl"
	>
		<Info size={18} class="text-[#3478F6]" />
		{t.unavailableFeature}
	</div>
{/if}
