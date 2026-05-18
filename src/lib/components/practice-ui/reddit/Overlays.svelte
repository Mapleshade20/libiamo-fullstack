<script lang="ts">
import CheckCircle from "@lucide/svelte/icons/check-circle";
import Info from "@lucide/svelte/icons/info";
import { fade } from "svelte/transition";
import type { TutorFeedback } from "../types";

let {
	showEvaluationModal = false,
	feedback = null as TutorFeedback | null,
	showToast = false,
	taskId = "" as string | number,
	t = {} as Record<string, string>,
	onCloseEvaluation = () => {},
}: {
	showEvaluationModal?: boolean;
	feedback?: TutorFeedback | null;
	showToast?: boolean;
	taskId?: string | number;
	t?: Record<string, string>;
	onCloseEvaluation?: () => void;
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

<!-- Evaluation modal -->
{#if showEvaluationModal && feedback}
	<div transition:fade={{ duration: 200 }} class="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
		<div class="max-h-[86vh] w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
			<!-- Header -->
			<div class="bg-[#FF4500] px-6 py-5 text-center">
				<CheckCircle class="mx-auto mb-2 text-white drop-shadow" size={48} />
				<h2 class="text-xl font-black text-white uppercase tracking-wide">{t.questCompleted}</h2>
				<p class="mt-0.5 text-sm text-white/80">{t.tutorReport}</p>
			</div>

			<!-- Body -->
			<div class="max-h-[52vh] overflow-y-auto px-6 py-5">
				<h3 class="mb-2 text-[10px] font-black tracking-widest text-[#878A8C] uppercase">{t.overallFeedback}</h3>
				<p class="whitespace-pre-wrap rounded-md bg-[#F6F7F8] p-4 text-sm leading-6 text-[#1C1C1C]">{feedback.content}</p>

				{#if feedback.objectiveResults?.length}
					<h3 class="mt-5 mb-2 text-[10px] font-black tracking-widest text-[#878A8C] uppercase">{t.objectiveAssessment}</h3>
					<div class="space-y-2">
						{#each feedback.objectiveResults as obj}
							<div class="flex items-center justify-between rounded-md bg-[#F6F7F8] px-3 py-2.5">
								<span class="pr-4 text-sm leading-snug text-[#1C1C1C]">{obj.text}</span>
								<span
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded font-black text-sm {obj.grade === 'A' ? 'bg-[#46D160] text-white' : obj.grade === 'B' ? 'bg-[#FFB000] text-white' : 'bg-[#FF585B] text-white'}"
								>
									{obj.grade}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex justify-end gap-2 border-t border-[#EDEFF1] px-6 py-4">
				<button
					type="button"
					class="rounded-full border border-[#EDEFF1] px-4 py-2 text-sm font-bold text-[#1C1C1C] transition-colors hover:bg-[#F6F7F8]"
					onclick={onCloseEvaluation}
				>
					{t.closeReview}
				</button>
				<a href="/" class="rounded-full bg-[#FF4500] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#CC3700]"> {t.returnHall} </a>
			</div>
		</div>
	</div>
{/if}
