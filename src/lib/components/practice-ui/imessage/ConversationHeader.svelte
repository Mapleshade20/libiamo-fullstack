<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import TurnsLeftMobileBadge from "../TurnsLeftMobileBadge.svelte";

let {
	contactName,
	contactInitial,
	latestPreviewText,
	remainingTurns,
	isCompleted,
	finishLabel,
	evaluatingLabel,
	leaveTask,
	taskHref,
	canFinish,
	onFinish,
}: {
	contactName: string;
	contactInitial: string;
	latestPreviewText: string;
	remainingTurns: number | null;
	isCompleted: boolean;
	finishLabel: string;
	evaluatingLabel: string;
	leaveTask: string;
	taskHref: string;
	canFinish: boolean;
	onFinish: () => void;
} = $props();
</script>

<aside class="hidden w-[290px] shrink-0 flex-col border-r border-[#E0D3D8] bg-[#F6E9EE] md:flex">
	<div class="border-b border-[#E8DDE2] px-4 py-3">
		<div class="mb-3 flex items-center gap-2">
			<a href={taskHref} class="block h-3 w-3 rounded-full bg-[#FF5F57]" aria-label={leaveTask}></a
			><span class="h-3 w-3 rounded-full bg-[#FEBC2E]"></span><span class="h-3 w-3 rounded-full bg-[#28C840]"></span>
		</div>
		<div class="flex items-center gap-2 rounded-lg bg-white/80 px-2 py-1.5 text-xs text-[#8E8E93]">Messages</div>
	</div>
	<div class="px-2 py-2">
		<div class="flex w-full items-center gap-3 rounded-xl bg-[#0A84FF] px-3 py-2.5 text-left text-white shadow-sm">
			<div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-sm font-semibold text-[#1C1C1E]">{contactInitial}</div>
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-semibold">{contactName}</p>
				<p class="truncate text-[11px] text-white/80">{latestPreviewText}</p>
			</div>
		</div>
	</div>
</aside>
<header class="flex h-14 shrink-0 items-center justify-between border-b border-[#E5E5EA] bg-white px-4">
	<a href={taskHref} class="flex items-center gap-1 text-[#0A84FF] md:hidden" aria-label={leaveTask}
		><ChevronLeft size={18} /><span class="text-sm">{leaveTask}</span></a
	>
	<div class="absolute left-1/2 -translate-x-1/2 text-center"><p class="text-sm font-semibold text-[#1C1C1E]">{contactName}</p></div>
	<div class="ml-auto flex items-center gap-3">
		{#if remainingTurns !== null && !isCompleted}
			<TurnsLeftMobileBadge
				{remainingTurns}
				{isCompleted}
				label="Turns left"
				class="rounded-full bg-[#E5E5EA] px-2.5 py-1 text-xs font-semibold text-[#8E8E93]"
			/>
		{/if}
		{#if canFinish}
			<button type="button" class="rounded-full bg-[#0A84FF] px-3 py-1 text-xs font-semibold text-white" onclick={onFinish}>{evaluatingLabel}</button>
		{/if}
	</div>
</header>
