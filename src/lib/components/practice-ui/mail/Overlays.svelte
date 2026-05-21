<script lang="ts">
import CheckCircle from "@lucide/svelte/icons/check-circle";
import Info from "@lucide/svelte/icons/info";
import { fade, fly } from "svelte/transition";
import type { TutorFeedback } from "../types";

let {
	showEvaluationModal = false,
	feedback = null as TutorFeedback | null,
	showToast = false,
	t = {} as Record<string, string>,
	onCloseEvaluation = () => {},
}: {
	showEvaluationModal?: boolean;
	feedback?: TutorFeedback | null;
	showToast?: boolean;
	t?: Record<string, string>;
	onCloseEvaluation?: () => void;
} = $props();
</script>

{#if showEvaluationModal && feedback}
	<div transition:fade={{ duration: 200 }} class="absolute inset-0 z-[2000] flex items-center justify-center bg-black/35 p-4 backdrop-blur-md">
		<div class="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[14px] border border-black/10 bg-white shadow-2xl">
			<div class="border-b border-black/10 bg-[#F7F7F9] px-6 py-5 text-center">
				<CheckCircle class="mx-auto mb-2 text-[#34C759]" size={48} />
				<h2 class="text-xl font-semibold text-[#1D1D1F]">{t.questCompleted}</h2>
				<p class="mt-1 text-sm text-[#6E6E73]">{t.tutorReport}</p>
			</div>
			<div class="overflow-y-auto p-6">
				<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6E6E73]">{t.overallFeedback}</h3>
				<p class="mb-6 rounded-lg border border-black/10 bg-[#F7F7F9] p-4 text-sm leading-relaxed whitespace-pre-wrap">{feedback.content}</p>
				{#if feedback.objectiveResults && feedback.objectiveResults.length > 0}
					<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6E6E73]">{t.objectiveAssessment}</h3>
					<div class="space-y-2">
						{#each feedback.objectiveResults as obj}
							<div class="flex items-center justify-between rounded-lg border border-black/10 bg-white p-3 shadow-sm">
								<span class="pr-4 text-sm leading-snug text-[#1D1D1F]">{obj.text}</span>
								<span
									class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold {obj.grade === 'A'
										? 'bg-[#34C759] text-white'
										: obj.grade === 'B'
											? 'bg-[#FFD60A] text-black'
											: 'bg-[#FF3B30] text-white'}"
									>{obj.grade}</span
								>
							</div>
						{/each}
					</div>
				{/if}
			</div>
			<div class="flex justify-end gap-3 border-t border-black/10 bg-[#F7F7F9] p-4">
				<button type="button" class="rounded-md bg-[#E5E5EA] px-4 py-2 text-sm font-medium hover:bg-[#D1D1D6]" onclick={onCloseEvaluation}>
					{t.closeReview}
				</button>
				<a href="/" class="rounded-md bg-[#3478F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A64FF]">{t.returnHall}</a>
			</div>
		</div>
	</div>
{/if}

{#if showToast}
	<div
		transition:fly={{ y: -8, duration: 150 }}
		class="absolute left-1/2 top-6 z-[1500] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-[#1D1D1F] shadow-xl"
	>
		<Info size={18} class="text-[#3478F6]" />
		{t.unavailableFeature}
	</div>
{/if}
