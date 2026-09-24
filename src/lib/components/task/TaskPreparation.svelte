<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Languages from "@lucide/svelte/icons/languages";
import { base } from "$app/paths";
import QuestMenuStatusMark from "$lib/components/quest-hall/quest-menu/QuestMenuStatusMark.svelte";
import TranslateModal from "$lib/components/translate/TranslateModal.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import type { LanguageCode } from "$lib/constants";
import { INTERACTION_TYPE_LABELS, UI_VARIANT_LABELS } from "$lib/constants";
import { t } from "$lib/i18n";
import { renderMarkdown } from "$lib/markdown";
import { questState } from "$lib/quest-hall/menu";
import type { TaskPreparationTask } from "$lib/server/task-preparation";

interface Props {
	task: TaskPreparationTask;
	nativeLanguage: string | null;
	backHref?: string;
	backLabel?: string;
	onback?: (event: MouseEvent) => void;
	simulated?: boolean;
}

let { task, nativeLanguage, backHref = `${base}/`, backLabel, onback, simulated = false }: Props = $props();

let objectives = $derived(task.objectives ?? []);
let progress = $derived(questState(task));
let lang = $derived(task.language as LanguageCode);
let showTranslateModal = $state(false);
let showNativeLanguagePrompt = $state(false);
let expressionsTrigger = $state<HTMLButtonElement | null>(null);
let hasNativeLanguage = $derived(typeof nativeLanguage === "string" && nativeLanguage.trim().length > 0);
let canShowUsefulExpressions = $derived((progress === "ready" || progress === "active") && (!hasNativeLanguage || nativeLanguage !== task.language));
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

<section class="task-preparation" aria-labelledby="task-preparation-title">
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
				<QuestMenuStatusMark state={progress} label={t(lang, `hall.menu.status.${progress}`)} variant={progress === "finished" ? "stamp" : "line"} />
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest">{UI_VARIANT_LABELS[task.ui]}</Badge>
				<Badge variant="outline" class="text-[10px] font-bold uppercase tracking-widest">{INTERACTION_TYPE_LABELS.chat}</Badge>
				<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"> {difficultyLabel(task.difficulty)} </span>
			</div>

			<h2 id="task-preparation-title" class="text-2xl md:text-3xl">{task.title}</h2>
		</div>

		{#if task.description}
			<p class="mt-8 font-prose text-base leading-relaxed text-muted-foreground">{task.description}</p>
		{/if}

		{#if objectives.length > 0}
			<div class="mt-8">
				<h3 class="mb-2">{t(lang, "task.objectives")}</h3>

				<ol class="list-inside list-decimal space-y-1.5 font-prose text-base leading-relaxed text-muted-foreground">
					{#each objectives as obj}
						<li>{obj}</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if task.materialsMd}
			<div class="mt-10">
				<h3 class="mb-2">{t(lang, "task.backgroundMaterial")}</h3>

				<div
					class="task-background-material prose prose-neutral rounded-lg border border-border bg-card p-5 font-prose text-base leading-normal shadow-sm"
				>
					{@html renderMarkdown(task.materialsMd, { headingOffset: 2 })}
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
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
				<div class="flex w-full min-w-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
					{#if canShowUsefulExpressions}
						<Button bind:ref={expressionsTrigger} variant="outline" class="min-h-11 w-full justify-center sm:w-auto" onclick={openTranslateModal}>
							<Languages size={14} class="mr-1.5" />
							{t(lang, "task.usefulExpressions")}
						</Button>
					{/if}

					{#if progress === "finished"}
						{#if simulated}
							<Button variant="outline" class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" disabled>Bilan simulé</Button>
						{:else}
							<Button variant="outline" class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" href="{base}/task/{task.id}/feedback">
								{t(lang, "hall.reviewReport")}
							</Button>
						{/if}
					{:else if progress === "reviewing"}
						<Button class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" href="{base}/task/{task.id}/feedback">
							{t(lang, "task.continueEvaluation")}
						</Button>
					{:else if progress === "stopped"}
						<!-- Abuse termination ends the session while still delivering the agent's
					     parting reply, so the transcript must stay reachable to read it. -->
						<Button variant="outline" class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" href="{base}/task/{task.id}/session">
							{t(lang, "task.viewConversation")}
						</Button>
					{:else if progress === "active" || progress === "ready"}
						<Button class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" href="{base}/task/{task.id}/session">
							{t(lang, progress === "active" ? "task.continuePractice" : "task.startPractice")}
						</Button>
					{:else}
						<Button class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8" disabled variant="secondary">{t(lang, "task.comingSoon")}</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
	{#if progress === "finished"}
		<!-- Matches the translation details page; clipped separately so edge focus rings are not. -->
		<div class="completion-watermark" aria-hidden="true"><CheckCircle2 size={280} strokeWidth={1} /></div>
	{/if}
</section>

<style>
.task-preparation {
	position: relative;
	isolation: isolate;
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
}

.task-preparation {
	min-height: clamp(30rem, 64vh, 42rem);
}

.completion-watermark {
	position: absolute;
	inset: 0;
	z-index: -1;
	overflow: hidden;
	color: color-mix(in oklab, #278553 7%, transparent);
	pointer-events: none;
}

.completion-watermark :global(svg) {
	position: absolute;
	right: -5rem;
	top: -4rem;
}

.task-preparation .task-preparation-body {
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
			{lang}
			show={showTranslateModal}
			{nativeLanguage}
			targetLanguage={task.language}
			{generateExpressionsAction}
			{evaluateTranslationAction}
			onclose={closeTranslateModal}
		/>
	{/key}
{/if}
