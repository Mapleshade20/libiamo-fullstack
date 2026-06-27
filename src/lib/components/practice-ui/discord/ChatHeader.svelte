<script lang="ts">
import CheckCircle from "@lucide/svelte/icons/check-circle";
import Hash from "@lucide/svelte/icons/hash";
import Users from "@lucide/svelte/icons/users";
import TurnsLeftMobileBadge from "../TurnsLeftMobileBadge.svelte";

let {
	channelName = "",
	remainingTurns = null as number | null,
	isCompleted = false,
	sessionId = null as number | null,
	isCompleting = false,
	isSubmitting = false,
	isInitializing = false,
	showMembers = true,
	turnsLeftLabel = "Turns Left",
	evaluatingLabel = "Evaluating...",
	finishTaskLabel = "Finish Task",
	onComplete = () => {},
	onToggleMembers = () => {},
}: {
	channelName?: string;
	remainingTurns?: number | null;
	isCompleted?: boolean;
	sessionId?: number | null;
	isCompleting?: boolean;
	isSubmitting?: boolean;
	isInitializing?: boolean;
	showMembers?: boolean;
	turnsLeftLabel?: string;
	evaluatingLabel?: string;
	finishTaskLabel?: string;
	onComplete?: () => void;
	onToggleMembers?: () => void;
} = $props();
</script>

<div class="flex h-12 shrink-0 items-center justify-between border-b border-[#1F2023] px-4 shadow-sm z-10">
	<div class="flex items-center gap-2 overflow-hidden px-1">
		<Hash size={24} class="text-[#80848E] shrink-0" />
		<span class="font-semibold text-white truncate">{channelName}</span>
	</div>
	<div class="flex items-center gap-4 text-[#B5BAC1]">
		{#if remainingTurns !== null && !isCompleted}
			<TurnsLeftMobileBadge
				{remainingTurns}
				{isCompleted}
				label={turnsLeftLabel}
				class="rounded bg-[#232428] px-2.5 py-1 text-sm font-black {remainingTurns <= 2 ? 'text-[#DA373C]' : 'text-[#23A559]'} shadow-inner border border-[#1E1F22]"
			/>
			<div class="hidden items-center gap-2 px-3 py-1 rounded bg-[#232428] shadow-inner border border-[#1E1F22] md:flex">
				<span class="text-xs font-bold text-[#949BA4] uppercase tracking-wider">{turnsLeftLabel}</span>
				<span
					class="text-sm font-black {remainingTurns <= 2
						? 'text-[#DA373C]'
						: 'text-[#23A559]'}"
				>
					{remainingTurns}
				</span>
			</div>
		{/if}
		{#if !isCompleted && sessionId}
			<button
				type="button"
				class="flex items-center gap-2 rounded bg-[#23A559] px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-[#1D8749] disabled:opacity-50"
				onclick={onComplete}
				disabled={isCompleting || isSubmitting || isInitializing}
			>
				<CheckCircle size={16} />
				<span class="hidden sm:inline">{isCompleting ? evaluatingLabel : finishTaskLabel}</span>
			</button>
		{/if}
		<button
			type="button"
			class="transition-colors {showMembers
				? 'text-white'
				: 'hover:text-[#DBDEE1]'}"
			onclick={onToggleMembers}
		>
			<Users size={20} />
		</button>
	</div>
</div>
