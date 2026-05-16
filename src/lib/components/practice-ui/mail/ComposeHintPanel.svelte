<script lang="ts">
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Circle from "@lucide/svelte/icons/circle";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import X from "@lucide/svelte/icons/x";
import type { MailHint } from "./types";

let {
	hint = null as MailHint | null,
	isGettingHint = false,
	t = {} as Record<string, string>,
	onCloseHint = () => {},
	onInsertHint = (_text: string, _kind?: "body" | "subject") => {},
}: {
	hint?: MailHint | null;
	isGettingHint?: boolean;
	t?: Record<string, string>;
	onCloseHint?: () => void;
	onInsertHint?: (text: string, kind?: "body" | "subject") => void;
} = $props();
</script>

<div class="shrink-0 overflow-y-auto border-t border-black/10 bg-[#FBFBFD] p-3" style:max-height="min(340px, 45dvh)">
	<div class="mb-2 flex items-center justify-between">
		<div class="flex items-center gap-2 text-sm font-semibold text-[#1D1D1F]">
			<Lightbulb size={16} class="text-[#FF9F0A]" />
			{t.hintTitle}
		</div>
		<button type="button" class="rounded p-1 text-[#6E6E73] hover:bg-black/10 hover:text-[#1D1D1F]" onclick={onCloseHint}><X size={15} /></button>
	</div>
	{#if isGettingHint}
		<div class="flex items-center gap-2 py-5 text-sm text-[#6E6E73]">
			<LoaderCircle size={16} class="animate-spin" />
			{t.thinking}
		</div>
	{:else if hint}
		{@const subjectText = hint.subjectSuggestion?.text ?? ""}
		{@const nextSectionText = hint.nextSection?.text ?? ""}
		{@const nextSectionTitle = hint.nextSection?.title ?? ""}
		{@const nextSentenceText = hint.nextSentence?.text ?? ""}
		{@const nextSentenceTitle = hint.nextSentence?.title ?? ""}
		{#if subjectText}
			<div class="mb-3 rounded-lg border border-[#D1E3FF] bg-[#F2F7FF] p-3">
				<div class="text-[0.72rem] font-bold uppercase text-[#6E6E73]">{t.subject}</div>
				<p class="mt-1 text-sm leading-snug text-[#1D1D1F]">{subjectText}</p>
				<button
					type="button"
					class="mt-2.5 rounded-md bg-[#3478F6] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#0A64FF]"
					onclick={() => onInsertHint(subjectText, "subject")}
				>
					{t.insert}
				</button>
			</div>
		{/if}
		<div class="grid gap-3 {nextSectionText ? 'md:grid-cols-[1fr_1fr]' : ''}">
			{#if nextSectionText}
				<div class="rounded-lg border border-black/10 bg-white p-3">
					<div class="text-[0.72rem] font-bold uppercase text-[#6E6E73]">{t.nextSection}</div>
					<div class="mt-1 text-sm font-semibold text-[#1D1D1F]">{nextSectionTitle}</div>
					<p class="mt-2 whitespace-pre-wrap text-sm leading-snug text-[#3A3A3C]">{nextSectionText}</p>
					<button
						type="button"
						class="mt-2.5 rounded-md bg-[#3478F6] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#0A64FF]"
						onclick={() => onInsertHint(nextSectionText, "body")}
					>
						{t.insert}
					</button>
				</div>
			{/if}
			{#if nextSentenceText}
				<div class="rounded-lg border border-black/10 bg-white p-3">
					<div class="text-[0.72rem] font-bold uppercase text-[#6E6E73]">{t.nextSentence}</div>
					<div class="mt-1 text-sm font-semibold text-[#1D1D1F]">{nextSentenceTitle}</div>
					<p class="mt-2 whitespace-pre-wrap text-sm leading-snug text-[#3A3A3C]">{nextSentenceText}</p>
					<button
						type="button"
						class="mt-2.5 rounded-md bg-[#3478F6] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#0A64FF]"
						onclick={() => onInsertHint(nextSentenceText, "body")}
					>
						{t.insert}
					</button>
				</div>
			{/if}
		</div>
		{#if hint.checklist?.length}
			<div class="mt-3 rounded-lg border border-black/10 bg-white p-3">
				<div class="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6E6E73]">{t.checklist}</div>
				<div class="space-y-2">
					{#each hint.checklist ?? [] as item}
						<div class="flex gap-2 text-sm">
							{#if item.done}
								<CheckCircle2 size={17} class="mt-0.5 shrink-0 text-[#34C759]" />
							{:else}
								<Circle size={17} class="mt-0.5 shrink-0 text-[#8E8E93]" />
							{/if}
							<div class="min-w-0">
								<div class="font-medium text-[#1D1D1F]">{item.text}</div>
								<div class="text-xs leading-snug text-[#6E6E73]">{item.note}</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
