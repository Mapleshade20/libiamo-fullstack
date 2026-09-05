<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Languages from "@lucide/svelte/icons/languages";
import Star from "@lucide/svelte/icons/star";
import { base } from "$app/paths";
import { isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";
import TranslateModal from "$lib/components/translate/TranslateModal.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { INTERACTION_TYPE_LABELS, UI_VARIANT_LABELS } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";
import { renderMarkdown } from "$lib/markdown";
import type { TaskPreparationTask } from "$lib/server/task-preparation";

interface Props {
	task: TaskPreparationTask;
	nativeLanguage: string | null;
	backHref?: string;
	backLabel?: string;
	onback?: (event: MouseEvent) => void;
	mode?: "page" | "pane";
	simulated?: boolean;
}

let { task, nativeLanguage, backHref = `${base}/`, backLabel, onback, mode = "page", simulated = false }: Props = $props();

let objectives = $derived(task.objectives ?? []);
let isPracticeEnabled = $derived(isPracticeUiImplemented(task.templateUi));
let isFinished = $derived(task.sessionStatus === "completed" || task.sessionStatus === "evaluated");
let isAbandoned = $derived(task.sessionStatus === "abandoned");
let lang = $derived(task.language as LanguageCode);
let showTranslateModal = $state(false);
let showNativeLanguagePrompt = $state(false);
let expressionsTrigger = $state<HTMLButtonElement | null>(null);
let hasNativeLanguage = $derived(typeof nativeLanguage === "string" && nativeLanguage.trim().length > 0);
let canShowUsefulExpressions = $derived(!isFinished && (!hasNativeLanguage || nativeLanguage !== task.language));
let resolvedBackLabel = $derived(backLabel ?? t(lang, "task.returnToHall"));
let generateExpressionsAction = $derived(`${base}/task/${task.id}?/generateExpressions`);
let evaluateTranslationAction = $derived(`${base}/task/${task.id}?/evaluateTranslation`);

function openTranslateModal() {
	if (!hasNativeLanguage) {
		showNativeLanguagePrompt = true;
		return;
	}
	showNativeLanguagePrompt = false;
	showTranslateModal = true;
}

function closeTranslateModal() {
	showTranslateModal = false;
	queueMicrotask(() => expressionsTrigger?.focus());
}

function difficultyLabel(level: number): string {
	return (
		[t(lang, "task.difficulty.beginner"), t(lang, "task.difficulty.intermediate"), t(lang, "task.difficulty.advanced")][level - 1] ??
		`${t(lang, "hall.difficulty")} ${level}`
	);
}
</script>

<section class="task-preparation" class:is-pane={mode === "pane"} aria-labelledby="task-preparation-title">
	{#if onback}
		<button
			type="button"
			onclick={onback}
			class="group flex min-h-11 w-fit items-center gap-2 border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" aria-hidden="true" />
			<span class="text-sm font-medium uppercase tracking-wide">{resolvedBackLabel}</span>
		</button>
	{:else}
		<a href={backHref} class="group flex min-h-11 w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
			<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" aria-hidden="true" />
			<span class="text-sm font-medium uppercase tracking-wide">{resolvedBackLabel}</span>
		</a>
	{/if}

	<div class="task-preparation-body mt-12 flex flex-1 flex-col">
		<div>
			<div class="mb-4 flex flex-wrap items-center gap-2">
				{#if isFinished}
					<Badge class="border-green-500/20 bg-green-500/10 text-[10px] font-bold uppercase tracking-widest text-green-600 hover:bg-green-500/10">
						{t(lang, "task.completed")}
					</Badge>
				{:else if isAbandoned}
					<Badge variant="destructive" class="text-[10px] font-bold uppercase tracking-widest"> {t(lang, "task.abandoned")} </Badge>
				{/if}
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest">
					{UI_VARIANT_LABELS[task.templateUi as keyof typeof UI_VARIANT_LABELS] ?? task.templateUi}
				</Badge>
				<Badge variant="outline" class="text-[10px] font-bold uppercase tracking-widest">
					{INTERACTION_TYPE_LABELS[task.templateInteractionType as keyof typeof INTERACTION_TYPE_LABELS] ?? task.templateInteractionType}
				</Badge>
				<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"> {difficultyLabel(task.templateDifficulty)} </span>
			</div>
			{#if mode === "pane"}
				<h2 id="task-preparation-title" class="text-2xl md:text-3xl">{task.title}</h2>
			{:else}
				<h1 id="task-preparation-title" class="text-2xl md:text-3xl">{task.title}</h1>
			{/if}
		</div>

		{#if task.description}
			<p class="mt-8 text-base leading-relaxed text-muted-foreground">{task.description}</p>
		{/if}

		{#if objectives.length > 0}
			<div class="mt-8">
				{#if mode === "pane"}
					<h3 class="mb-2">{t(lang, "task.objectives")}</h3>
				{:else}
					<h2 class="mb-2">{t(lang, "task.objectives")}</h2>
				{/if}
				<ol class="list-inside list-decimal space-y-1.5 text-base leading-relaxed text-muted-foreground">
					{#each objectives as obj}
						<li>{obj}</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if task.materialsMd}
			<div class="mt-10">
				{#if mode === "pane"}
					<h3 class="mb-2">{t(lang, "task.backgroundMaterial")}</h3>
				{:else}
					<h2 class="mb-2">{t(lang, "task.backgroundMaterial")}</h2>
				{/if}
				<div class="task-background-material prose prose-neutral rounded-lg border border-border bg-card p-5 text-base leading-normal shadow-sm">
					{@html renderMarkdown(task.materialsMd, { headingOffset: mode === "pane" ? 2 : 0 })}
				</div>
			</div>
		{/if}

		{#if showNativeLanguagePrompt}
			<div class="mt-10 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
				{t(lang, "translate.details.missingNative")}
				<a href="{base}/profile" class="font-medium underline hover:no-underline">{t(lang, "translate.details.settings")}</a>.
			</div>
		{/if}

		<div class="mt-auto pt-12 pb-4">
			<div class="mb-6 h-px w-full bg-border"></div>
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
						<Button bind:ref={expressionsTrigger} variant="outline" class="min-h-11 w-full justify-center sm:w-auto" onclick={openTranslateModal}>
							<Languages size={14} class="mr-1.5" />
							{t(lang, "task.usefulExpressions")}
						</Button>
					{/if}

					{#if isFinished}
						{#if simulated}
							<Button class="min-h-11 w-full justify-center border border-green-400 bg-green-100 px-4 text-black sm:w-auto sm:px-8" disabled>
								Bilan simulé
							</Button>
						{:else}
							<Button
								class="min-h-11 w-full justify-center border border-green-400 bg-green-100 px-4 text-black hover:bg-green-200 sm:w-auto sm:px-8"
								href="{base}/task/{task.id}/feedback"
							>
								{t(lang, "hall.reviewReport")}
							</Button>
						{/if}
					{:else if isAbandoned}
						<!-- Abuse termination ends the session while still delivering the agent's
					     parting reply, so the transcript must stay reachable to read it. -->
						<Button variant="outline" class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" href="{base}/task/{task.id}/session">
							{t(lang, "task.viewConversation")}
						</Button>
					{:else if isPracticeEnabled}
						<Button class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" href="{base}/task/{task.id}/session">
							{t(lang, "task.startPractice")}
						</Button>
					{:else}
						<Button class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" disabled variant="secondary">{t(lang, "task.comingSoon")}</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</section>

<style>
.task-preparation {
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
}

.task-preparation.is-pane {
	min-height: clamp(30rem, 64vh, 42rem);
}

.task-preparation.is-pane .task-preparation-body {
	margin-top: clamp(1.75rem, 5vw, 3rem);
}

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
	{#key task.id}
		<TranslateModal
			show={showTranslateModal}
			taskTitle={task.title}
			taskDescription={task.description ?? null}
			taskObjectives={objectives}
			taskUi={task.templateUi}
			taskInteractionType={task.templateInteractionType}
			{nativeLanguage}
			targetLanguage={task.language}
			{generateExpressionsAction}
			{evaluateTranslationAction}
			onclose={closeTranslateModal}
		/>
	{/key}
{/if}
