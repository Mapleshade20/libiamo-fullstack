<script lang="ts">
import CheckCircle from "@lucide/svelte/icons/check-circle";
import Info from "@lucide/svelte/icons/info";
import { fade } from "svelte/transition";
import type { TutorFeedback } from "../types";
import type { ChatUser } from "./types";

let {
	showEvaluationModal = false,
	feedback = null as TutorFeedback | null,
	contextMenu = { show: false, x: 0, y: 0, targetUser: null as ChatUser | null },
	showToast = false,
	taskId = "",
	t = {} as Record<string, string>,
	onCloseEvaluation = () => {},
	onContextMenuMention = () => {},
}: {
	showEvaluationModal?: boolean;
	feedback?: TutorFeedback | null;
	contextMenu?: { show: boolean; x: number; y: number; targetUser: ChatUser | null };
	showToast?: boolean;
	taskId?: string | number;
	t?: Record<string, string>;
	onCloseEvaluation?: () => void;
	onContextMenuMention?: () => void;
} = $props();
</script>

{#if showEvaluationModal && feedback}
	<div transition:fade={{ duration: 200 }} class="absolute inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
		<div class="bg-[#2B2D31] border border-[#1E1F22] rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col transform transition-all">
			<div class="bg-[#23A559] p-6 text-center relative">
				<CheckCircle class="mx-auto text-white mb-2 drop-shadow-md" size={56} />
				<h2 class="text-2xl font-black text-white uppercase tracking-wide drop-shadow-md">{t.questCompleted}</h2>
				<p class="text-green-100 mt-1 font-medium text-sm">{t.tutorReport}</p>
			</div>
			<div class="p-6 overflow-y-auto max-h-[50vh] hide-scrollbar bg-[#313338]">
				<h3 class="text-xs font-black text-[#949BA4] uppercase mb-2 tracking-wider">{t.overallFeedback}</h3>
				<p class="text-[#DBDEE1] text-[15px] leading-relaxed whitespace-pre-wrap mb-8 bg-[#2B2D31] p-4 rounded-lg border border-[#1E1F22]">
					{feedback.summary}
				</p>
				{#if feedback.objectiveResults && feedback.objectiveResults.length > 0}
					<h3 class="text-xs font-black text-[#949BA4] uppercase mb-3 tracking-wider">{t.objectiveAssessment}</h3>
					<div class="space-y-2">
						{#each feedback.objectiveResults as obj}
							<div class="flex items-center justify-between bg-[#2B2D31] p-3 rounded-lg border border-[#1E1F22] shadow-sm">
								<span class="text-[14px] text-[#DBDEE1] font-medium pr-4 leading-snug">{obj.text}</span>
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-base font-black shadow-inner {obj.grade ===
									'A'
										? 'bg-[#23A559] text-white'
										: obj.grade === 'B'
											? 'bg-[#FEE75C] text-black'
											: 'bg-[#DA373C] text-white'}"
									>{obj.grade}</span
								>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="p-5 bg-[#2B2D31] border-t border-[#1E1F22] flex justify-end gap-3">
				<button
					type="button"
					class="px-5 py-2 rounded-md font-bold text-sm text-white bg-[#4E5058] hover:bg-[#6D6F78] transition-colors"
					onclick={onCloseEvaluation}
				>
					{t.closeReview}
				</button>
				<a
					href="/"
					class="px-6 py-2 rounded-md font-bold text-sm text-white bg-[#5865F2] hover:bg-[#4752C4] shadow-md transition-colors flex items-center gap-2"
					>{t.returnHall}</a
				>
			</div>
		</div>
	</div>
{/if}

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

<style>
.hide-scrollbar {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
