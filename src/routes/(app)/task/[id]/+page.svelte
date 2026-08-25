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
let isAbandoned = $derived(task.sessionStatus === "abandoned");
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
	return (
		[t(lang, "task.difficulty.beginner"), t(lang, "task.difficulty.intermediate"), t(lang, "task.difficulty.advanced")][level - 1] ??
		`${t(lang, "hall.difficulty")} ${level}`
	);
}
</script>

<svelte:head>
	<title>{task.title} · Libiamo</title>
	<meta name="description" content="Prepare for this language practice scenario, review objectives, and begin the session.">
</svelte:head>

<div class="fixed inset-0 bg-card overflow-hidden z-0">
	{#if isFinished}
		<div class="absolute -right-24 -top-24 text-green-500/5 pointer-events-none"><CheckCircle2 size={500} strokeWidth={1} /></div>
	{/if}
</div>

<div class="task-stagger relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-2xl min-w-0 flex-col">
	<a href="/" class="group flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
		<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
		<span class="text-sm font-medium uppercase tracking-wide">{t(lang, "task.returnToHall")}</span>
	</a>

	<div class="mt-12 flex-1 flex flex-col">
		<div>
			<div class="mb-4 flex flex-wrap items-center gap-2">
				{#if isFinished}
					<Badge class="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-500/20 text-[10px] font-bold uppercase tracking-widest">
						{t(lang, "task.completed")}
					</Badge>
				{:else if isAbandoned}
					<Badge variant="destructive" class="text-[10px] font-bold uppercase tracking-widest"> {t(lang, "task.abandoned")} </Badge>
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
			<p class="mt-8 text-base leading-relaxed text-muted-foreground">{task.description}</p>
		{/if}

		{#if objectives.length > 0}
			<div class="mt-8">
				<h2 class="mb-2">{t(lang, "task.objectives")}</h2>
				<ol class="list-inside list-decimal space-y-1.5 text-base leading-relaxed text-muted-foreground">
					{#each objectives as obj}
						<li>{obj}</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if task.materialsMd}
			<div class="mt-10">
				<h2 class="mb-2">{t(lang, "task.backgroundMaterial")}</h2>
				<div class="task-background-material prose prose-neutral text-base leading-normal rounded-lg border border-border bg-card p-5 shadow-sm">
					{@html renderMarkdown(task.materialsMd)}
				</div>
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
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex items-center gap-4 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<Star size={14} strokeWidth={1.5} />
						{task.pointReward}
						{t(lang, "task.points")}
					</span>
				</div>

				<div class="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
					{#if canShowUsefulExpressions}
						<Button variant="outline" class="w-full justify-center sm:w-auto" onclick={openTranslateModal}>
							<Languages size={14} class="mr-1.5" />
							{t(lang, "task.usefulExpressions")}
						</Button>
					{/if}

					{#if isFinished}
						<Button
							class="w-full justify-center border border-green-400 bg-green-100 px-4 text-black hover:bg-green-200 sm:w-auto sm:px-8"
							href="/task/{task.id}/feedback"
						>
							{t(lang, "hall.reviewReport")}
						</Button>
					{:else if isAbandoned}
						<span class="text-sm text-muted-foreground">{t(lang, "task.abandoned")}</span>
					{:else if isPracticeEnabled}
						<Button class="w-full justify-center px-4 sm:w-auto sm:px-8" href="/task/{task.id}/session">{t(lang, "task.startPractice")}</Button>
					{:else}
						<Button class="w-full justify-center px-4 sm:w-auto sm:px-8" disabled variant="secondary">{t(lang, "task.comingSoon")}</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
:global(.task-background-material h3) {
	margin-top: 0.5rem;
	margin-bottom: 0.25rem;
	line-height: 1.35;
}

:global(.task-background-material h3:first-child) {
	margin-top: 0;
}

:global(.task-background-material ul),
:global(.task-background-material ol) {
	margin-top: 0.25rem;
	margin-bottom: 0.75rem;
	padding-left: 1.25rem;
}

:global(.task-background-material li) {
	margin-top: 0.125rem;
	margin-bottom: 0.125rem;
}

:global(.task-background-material li > p) {
	margin: 0;
}

:global(.task-background-material li > strong) {
	display: inline;
}
</style>

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
