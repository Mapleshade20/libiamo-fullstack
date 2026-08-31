<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Clock from "@lucide/svelte/icons/clock";
import Gem from "@lucide/svelte/icons/gem";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Star from "@lucide/svelte/icons/star";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { INTERACTION_TYPE_LABELS, UI_VARIANT_LABELS } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";

let { data, form } = $props();
let lang = $derived(data.user.activeLanguage as LanguageCode);
let attempt = $derived(data.attempt);
let isDraft = $derived(!attempt || attempt.workflowPhase === "draft");
let isComplete = $derived(attempt?.workflowPhase === "completed");
let primaryHref = $derived(isDraft ? `/translate/${data.template.id}/attempt` : `/translate/${data.template.id}/feedback`);
let primaryLabel = $derived(
	!attempt
		? t(lang, "translate.details.begin")
		: attempt.workflowPhase === "draft"
			? t(lang, "translate.details.continueDraft")
			: isComplete
				? t(lang, "translate.details.review")
				: t(lang, "translate.details.continueEvaluation"),
);

function difficultyLabel(level: number): string {
	return (
		[t(lang, "task.difficulty.beginner"), t(lang, "task.difficulty.intermediate"), t(lang, "task.difficulty.advanced")][level - 1] ??
		`${t(lang, "hall.difficulty")} ${level}`
	);
}
</script>

<svelte:head>
	<title>{data.template.title} · Libiamo</title>
	<meta name="description" content="Review this translation task and continue to the draft or evaluation.">
</svelte:head>

<div class="fixed inset-0 z-0 overflow-hidden bg-card">
	{#if isComplete}
		<div class="pointer-events-none absolute -right-24 -top-24 text-green-500/5"><CheckCircle2 size={500} strokeWidth={1} /></div>
	{/if}
</div>

<div class="task-stagger relative z-10 mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-2xl min-w-0 flex-col">
	<a href="{base}/" class="group flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
		<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
		<span class="text-sm font-medium uppercase tracking-wide">{t(lang, "task.returnToHall")}</span>
	</a>

	<div class="mt-12 flex flex-1 flex-col">
		<div>
			<div class="mb-4 flex flex-wrap items-center gap-2">
				{#if isComplete}
					<Badge class="border-green-500/20 bg-green-500/10 text-[10px] font-bold uppercase tracking-widest text-green-600 hover:bg-green-500/10">
						{t(lang, "task.completed")}
					</Badge>
				{/if}
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest"> {UI_VARIANT_LABELS.translator} </Badge>
				<Badge variant="outline" class="text-[10px] font-bold uppercase tracking-widest"> {INTERACTION_TYPE_LABELS.translate} </Badge>
				<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"> {difficultyLabel(data.template.difficulty)} </span>
			</div>
			<h1 class="text-2xl md:text-3xl">{data.template.title}</h1>
		</div>

		{#if data.template.description}
			<p class="mt-8 text-base leading-relaxed text-muted-foreground">{data.template.description}</p>
		{/if}

		{#if data.blockedReason}
			<div class="mt-10 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
				<AlertCircle class="mt-0.5 shrink-0" size={17} />
				<p>
					{data.blockedReason === "same-language"
						? t(lang, "translate.details.sameLanguage")
						: t(lang, "translate.details.missingNative")}
				</p>
			</div>
		{/if}

		{#if form?.error}
			<p class="mt-5 text-sm text-destructive" role="alert">{form.error}</p>
		{/if}

		<div class="mt-auto pb-4 pt-12">
			<div class="mb-6 h-px w-full bg-border"></div>
			<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5"><Star size={14} strokeWidth={1.5} />{data.template.pointReward} {t(lang, "task.points")}</span>
					<span class="flex items-center gap-1.5"><Gem size={14} strokeWidth={1.5} />{data.template.gemReward} {t(lang, "task.gems")}</span>
					{#if data.template.estimatedWords}
						<span class="flex items-center gap-1.5"
							><Clock size={14} strokeWidth={1.5} />~{data.template.estimatedWords} {t(lang, "task.words")}</span
						>
					{/if}
				</div>

				{#if data.blockedReason}
					<Button href="{base}/profile" variant="outline" class="w-full justify-center sm:w-auto">
						<AlertCircle size={14} />
						{t(lang, "translate.details.settings")}
					</Button>
				{:else if !attempt}
					<form method="POST" action="?/start" use:enhance class="w-full sm:w-auto">
						<Button type="submit" class="w-full justify-center px-4 sm:w-auto sm:px-8">{primaryLabel}</Button>
					</form>
				{:else}
					<div class="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
						<Button href={primaryHref} class="w-full justify-center px-4 sm:w-auto sm:px-8">{primaryLabel}</Button>
						{#if !isDraft}
							<form
								method="POST"
								action="?/retake"
								use:enhance={({ cancel }) => {
									if (!confirm("Start over? This removes the unfinished evaluation and its notes.")) cancel();
									return async ({ update }) => update();
								}}
								class="w-full sm:w-auto"
							>
								<Button type="submit" variant="ghost" class="w-full justify-center sm:w-auto">
									<RotateCcw size={14} />
									{isComplete ? t(lang, "translate.details.tryAgain") : t(lang, "translate.details.abandon")}
								</Button>
							</form>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
