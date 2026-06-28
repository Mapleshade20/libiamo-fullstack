<script lang="ts">
import Bell from "@lucide/svelte/icons/bell";
import Menu from "@lucide/svelte/icons/menu";
import Plus from "@lucide/svelte/icons/plus";
import Search from "@lucide/svelte/icons/search";
import Video from "@lucide/svelte/icons/video";
import TurnsLeftMobileBadge from "../TurnsLeftMobileBadge.svelte";

let {
	t = {} as Record<string, string>,
	remainingTurns = null as number | null,
	isCompleted = false,
	sessionId = null as number | null,
	isCompleting = false,
	isSubmitting = false,
	isInitializing = false,
	onComplete = () => {},
	onMockAction = () => {},
	onToggleMobileMenu = () => {},
}: {
	t?: Record<string, string>;
	remainingTurns?: number | null;
	isCompleted?: boolean;
	sessionId?: number | null;
	isCompleting?: boolean;
	isSubmitting?: boolean;
	isInitializing?: boolean;
	onComplete?: () => void;
	onMockAction?: () => void;
	onToggleMobileMenu?: () => void;
} = $props();
</script>

<header class="z-20 flex h-12 shrink-0 items-center gap-2 border-b border-[#EDEFF1] bg-white px-3">
	<!-- Mobile menu toggle -->
	<button
		type="button"
		class="flex h-8 w-8 items-center justify-center rounded-md text-[#878A8C] hover:bg-[#F6F7F8] md:hidden"
		onclick={onToggleMobileMenu}
	>
		<Menu size={20} />
	</button>

	<!-- Logo -->
	<button type="button" class="flex shrink-0 items-center gap-1.5" onclick={onMockAction}>
		<span class="font-bold text-[#1C1C1C]">reddit</span>
	</button>

	<!-- Search bar -->
	<div class="mx-auto hidden w-full max-w-[480px] md:block">
		<button
			type="button"
			class="flex w-full cursor-pointer items-center gap-2 rounded-full border border-[#EDEFF1] bg-[#F6F7F8] py-1.5 pl-3 pr-4 text-sm text-[#878A8C] hover:border-[#0079D3] hover:bg-white"
			onclick={onMockAction}
		>
			<Search size={14} />
			<span>Search Reddit</span>
		</button>
	</div>

	<!-- Right actions -->
	<div class="ml-auto flex shrink-0 items-center gap-1">
		<!-- Decorative icon buttons -->
		<button
			type="button"
			class="hidden h-8 w-8 items-center justify-center rounded-md text-[#878A8C] hover:bg-[#F6F7F8] lg:flex"
			onclick={onMockAction}
		>
			<Plus size={18} />
		</button>
		<button
			type="button"
			class="hidden h-8 w-8 items-center justify-center rounded-md text-[#878A8C] hover:bg-[#F6F7F8] lg:flex"
			onclick={onMockAction}
		>
			<Video size={18} />
		</button>
		<button
			type="button"
			class="hidden h-8 w-8 items-center justify-center rounded-md text-[#878A8C] hover:bg-[#F6F7F8] lg:flex"
			onclick={onMockAction}
		>
			<Bell size={18} />
		</button>

		<!-- Turns counter -->
		{#if remainingTurns !== null && !isCompleted}
			<TurnsLeftMobileBadge
				{remainingTurns}
				{isCompleted}
				label={t.turnsLeft}
				class="rounded-full border border-[#EDEFF1] bg-[#F6F7F8] px-2.5 py-1 text-xs font-bold text-[#1C1C1C]"
			/>
			<span class="hidden text-xs text-[#878A8C] md:inline">
				{t.turnsLeft}: <strong class="{remainingTurns <= 2 ? 'text-[#FF4500]' : 'text-[#1C1C1C]'}">{remainingTurns}</strong>
			</span>
		{/if}

		<!-- Finish task button -->
		{#if !isCompleted && sessionId}
			<button
				type="button"
				class="ml-1 rounded-full bg-[#FF4500] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#CC3700] disabled:opacity-50"
				onclick={onComplete}
				disabled={isCompleting || isSubmitting || isInitializing}
			>
				{isCompleting ? t.evaluating : t.finishTask}
			</button>
		{/if}
	</div>
</header>
