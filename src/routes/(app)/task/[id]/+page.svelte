<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Languages from "@lucide/svelte/icons/languages";
import Star from "@lucide/svelte/icons/star";
import { isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";
import TranslateModal from "$lib/components/translate/TranslateModal.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { INTERACTION_TYPE_LABELS, UI_VARIANT_LABELS } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";
import { renderMarkdown } from "$lib/markdown";

let { data } = $props();
let task = $derived(data.task);
let nativeLanguage = $derived(data.nativeLanguage as string | null);

const objectives = $derived(task.objectives ?? []);

let isPracticeEnabled = $derived(isPracticeUiImplemented(task.templateUi));
let isFinished = $derived(task.sessionStatus === "completed" || task.sessionStatus === "evaluated");
let lang = $derived(task.language as LanguageCode);
let showTranslateModal = $state(false);
let showNativeLanguagePrompt = $state(false);
let hasNativeLanguage = $derived(typeof nativeLanguage === "string" && nativeLanguage.trim().length > 0);
let canShowUsefulExpressions = $derived(!isFinished && (!hasNativeLanguage || nativeLanguage !== task.language));

function openTranslateModal() {
	if (!hasNativeLanguage) {
		showNativeLanguagePrompt = true;
		return;
	}
	showNativeLanguagePrompt = false;
	showTranslateModal = true;
}

function difficultyLabel(level: number): string {
	return ["Beginner", "Intermediate", "Advanced"][level - 1] ?? `Level ${level}`;
}
</script>

<div class="fixed inset-0 bg-card overflow-hidden z-0">
	{#if isFinished}
		<div class="absolute -right-24 -top-24 text-green-500/5 pointer-events-none"><CheckCircle2 size={500} strokeWidth={1} /></div>
	{/if}
</div>

<div class="task-stagger relative z-10 mx-auto max-w-2xl flex flex-col min-h-[calc(100vh-8rem)]">
	<a href="/" class="group flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
		<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
		<span class="text-sm font-medium uppercase tracking-wide">Return to Quest Hall</span>
	</a>

	<div class="mt-12 flex-1 flex flex-col">
		<div>
			<div class="mb-4 flex flex-wrap items-center gap-2">
				{#if isFinished}
					<Badge class="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-500/20 text-[10px] font-bold uppercase tracking-widest">
						Completed
					</Badge>
				{/if}
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest">
					{UI_VARIANT_LABELS[
						task.templateUi as keyof typeof UI_VARIANT_LABELS
					] ?? task.templateUi}
				</Badge>
				<Badge variant="outline" class="text-[10px] font-bold uppercase tracking-widest">
					{INTERACTION_TYPE_LABELS[
						task.templateInteractionType as keyof typeof INTERACTION_TYPE_LABELS
					] ?? task.templateInteractionType}
				</Badge>
				<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"> {difficultyLabel(task.templateDifficulty)} </span>
			</div>
			<h1 class="text-2xl md:text-3xl">{task.title}</h1>
		</div>

		{#if task.description}
			<p class="mt-8 text-base font-light leading-relaxed text-muted-foreground">{task.description}</p>
		{/if}

		{#if objectives.length > 0}
			<div class="mt-8">
				<h2 class="mb-2">Objectives</h2>
				<ol class="list-inside list-decimal space-y-1.5 text-base font-light leading-relaxed text-muted-foreground">
					{#each objectives as obj}
						<li>{obj}</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if task.materialsMd}
			<div class="mt-10">
				<h2 class="mb-2">Background Material</h2>
				<div class="prose prose-neutral text-base font-light leading-relaxed whitespace-pre-wrap">{@html renderMarkdown(task.materialsMd)}</div>
			</div>
		{/if}

		{#if showNativeLanguagePrompt}
			<div class="mt-10 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
				Set your native language before using translation help.
				<a href="/profile" class="font-medium underline hover:no-underline">Go to profile settings</a>.
			</div>
		{/if}

		<div class="mt-auto pt-12 pb-4">
			<div class="h-px w-full bg-border mb-6"></div>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<Star size={14} strokeWidth={1.5} />
						{task.pointReward}
						pts
					</span>
				</div>

				<div class="flex items-center gap-3">
					{#if canShowUsefulExpressions}
						<Button variant="outline" onclick={openTranslateModal}>
							<Languages size={14} class="mr-1.5" />
							{t(lang, "task.usefulExpressions")}
						</Button>
					{/if}

					{#if isFinished}
						<Button class="px-8 bg-green-600 hover:bg-green-700 text-white" href="/task/{task.id}/session">{t(lang, "hall.reviewReport")}</Button>
					{:else if isPracticeEnabled}
						<Button class="px-8" href="/task/{task.id}/session">{t(lang, "task.startPractice")}</Button>
					{:else}
						<Button class="px-8" disabled variant="secondary">{t(lang, "task.comingSoon")}</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

{#if hasNativeLanguage && nativeLanguage}
	<TranslateModal
		show={showTranslateModal}
		taskTitle={task.title}
		taskDescription={task.description ?? null}
		taskObjectives={objectives}
		taskUi={task.templateUi}
		taskInteractionType={task.templateInteractionType}
		{nativeLanguage}
		targetLanguage={task.language}
		onclose={() => { showTranslateModal = false; }}
	/>
{/if}
