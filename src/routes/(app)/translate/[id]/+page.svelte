<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Clock from "@lucide/svelte/icons/clock";
import Gem from "@lucide/svelte/icons/gem";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Star from "@lucide/svelte/icons/star";
import { enhance } from "$app/forms";
import { Button } from "$lib/components/ui/button";
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
</script>

<svelte:head><title>{data.template.title} · Translation</title></svelte:head>

<div class="mx-auto max-w-4xl px-5 py-9 sm:px-8 lg:py-14">
	<a href="/" class="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
		><ArrowLeft size={15} />{t(lang, "translate.back")}</a
	>

	<section class="mt-10 overflow-hidden rounded-[2rem] border border-stone-300/70 bg-card/70 shadow-[0_24px_70px_-45px_rgba(70,55,35,0.45)]">
		<div class="border-b border-stone-300/60 px-6 py-8 sm:px-10 sm:py-11">
			<p class="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t(lang, "translate.details.studio")}</p>
			<h1 class="max-w-3xl font-serif text-4xl leading-[1.08] tracking-tight sm:text-5xl">{data.template.title}</h1>
			{#if data.template.description}
				<p class="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">{data.template.description}</p>
			{/if}
		</div>

		<div class="grid gap-8 px-6 py-7 sm:grid-cols-[1fr_auto] sm:items-end sm:px-10 sm:py-9">
			<div class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
				<span class="inline-flex items-center gap-1.5"><Star size={14} />{data.template.pointReward} pts</span>
				<span class="inline-flex items-center gap-1.5"><Gem size={14} />{data.template.gemReward} gems</span>
				{#if data.template.estimatedWords}
					<span class="inline-flex items-center gap-1.5"><Clock size={14} />~{data.template.estimatedWords} words</span>
				{/if}
			</div>

			{#if data.blockedReason}
				<Button href="/profile" variant="outline"><AlertCircle />{t(lang, "translate.details.settings")}</Button>
			{:else if !attempt}
				<form method="POST" action="?/start" use:enhance><Button type="submit">{primaryLabel}</Button></form>
			{:else}
				<div class="flex flex-wrap justify-end gap-2">
					<Button href={primaryHref}>{primaryLabel}</Button>
					{#if !isDraft}
						<form
							method="POST"
							action="?/retake"
							use:enhance={({ cancel }) => {
								if (!confirm("Start over? This removes the unfinished evaluation and its notes.")) cancel();
								return async ({ update }) => update();
							}}
						>
							<Button type="submit" variant="ghost"
								><RotateCcw />{isComplete ? t(lang, "translate.details.tryAgain") : t(lang, "translate.details.abandon")}</Button
							>
						</form>
					{/if}
				</div>
			{/if}
		</div>
	</section>

	{#if data.blockedReason}
		<div class="mt-6 flex gap-3 rounded-xl border border-amber-300/60 bg-amber-50/70 p-4 text-sm text-amber-950">
			<AlertCircle class="mt-0.5 shrink-0" size={17} />
			<p>{data.blockedReason === "same-language" ? t(lang, "translate.details.sameLanguage") : t(lang, "translate.details.missingNative")}</p>
		</div>
	{/if}
	{#if form?.error}
		<p class="mt-5 text-sm text-destructive" role="alert">{form.error}</p>
	{/if}
</div>
