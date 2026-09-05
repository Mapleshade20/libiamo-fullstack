<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Check from "@lucide/svelte/icons/check";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Send from "@lucide/svelte/icons/send";
import { onMount } from "svelte";
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import { base } from "$app/paths";
import { getQuestHallWorkflowReturnHref } from "$lib/client/quest-hall/return-context";
import {
	parseTranslationDraft,
	serializeTranslationDraft,
	type TranslationDraftAnswer,
	translationDraftStorageKey,
} from "$lib/client/translation-draft";
import { Button } from "$lib/components/ui/button";
import type { LanguageCode } from "$lib/constants";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { t } from "$lib/i18n";

let { data, form } = $props();
let lang = $derived(data.user.activeLanguage as LanguageCode);
let answers = $state<TranslationDraftAnswer[]>([]);
let candidatePickerIndex = $state<number | null>(null);
let initialized = $state(false);
let submitting = $state(false);
let allComplete = $derived(answers.length > 0 && answers.every((answer) => answer.translation.trim()));
// svelte-ignore state_referenced_locally
let detailsHref = $state(`${base}/translate/${data.template.id}`);

onMount(() => {
	detailsHref = getQuestHallWorkflowReturnHref({
		destination: "details",
		accountScope: data.accountScope,
		activeLanguage: lang,
		edition: data.questHallEdition,
		item: { kind: "translation", id: data.template.id },
		base,
		fallbackHref: detailsHref,
	});
});

$effect(() => {
	if (initialized) return;
	initialized = true;
	const fallback = data.attempt.answers.map((answer) => ({ ...answer, translation: "" }));
	try {
		answers = parseTranslationDraft(
			sessionStorage.getItem(translationDraftStorageKey(data.attempt.id)),
			fallback,
			data.attempt.candidates.map((set) => set.length),
		);
	} catch {
		answers = fallback;
	}
});

function updateAnswer(paragraphIndex: number, patch: Partial<TranslationDraftAnswer>) {
	answers = answers.map((answer) => (answer.paragraphIndex === paragraphIndex ? { ...answer, ...patch } : answer));
	try {
		sessionStorage.setItem(translationDraftStorageKey(data.attempt.id), serializeTranslationDraft(answers));
	} catch {
		/* unavailable */
	}
}
</script>

<svelte:head><title>{data.template.title} · Draft</title></svelte:head>
<svelte:window onkeydown={(event) => { if (event.key === "Escape") candidatePickerIndex = null; }} />

<div class="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:px-12">
	<a href={detailsHref} class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
		><ArrowLeft size={15} />{t(lang, "common.back")}</a
	>
	<header class="mt-8 border-b border-border pb-7">
		<p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t(lang, "translate.draft.title")}</p>
		<h1 class="font-serif text-3xl tracking-tight">{data.template.title}</h1>
		<p class="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t(lang, "translate.draft.body")}</p>
	</header>

	<form
		method="POST"
		action="?/submit"
		use:enhance={() => {
			submitting = true;
			return async ({ result, update }) => {
				submitting = false;
				if (result.type === "redirect") {
					try { sessionStorage.removeItem(translationDraftStorageKey(data.attempt.id)); } catch { /* unavailable */ }
					await goto(result.location);
					return;
				}
				await update({ reset: false });
			};
		}}
		class="py-9"
	>
		<input type="hidden" name="answers" value={JSON.stringify(answers)}>
		<div class="space-y-10">
			{#each answers as answer, index (answer.paragraphIndex)}
				<article class="grid gap-5 border-b border-border pb-10 lg:grid-cols-2 lg:gap-10">
					<div>
						<div class="mb-3 flex items-center justify-between gap-3">
							<span class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
								>{t(lang, "translate.draft.paragraph")} {index + 1}</span
							>
							<button
								type="button"
								onclick={() => (candidatePickerIndex = answer.paragraphIndex)}
								class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
							>
								{t(lang, "translate.draft.version")} {answer.candidateIndex + 1}<ChevronDown size={13} />
							</button>
						</div>
						<button
							type="button"
							onclick={() => (candidatePickerIndex = answer.paragraphIndex)}
							class="w-full text-left font-prose text-xl leading-relaxed"
						>
							{data.attempt.candidates[answer.paragraphIndex][answer.candidateIndex]}
						</button>
					</div>
					<textarea
						class="min-h-36 w-full resize-y rounded-xl border border-border bg-card/65 px-4 py-3 text-base leading-relaxed outline-none transition-shadow focus:ring-2 focus:ring-foreground/15"
						placeholder={t(lang, "translate.draft.placeholder")}
						maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
						value={answer.translation}
						oninput={(event) => updateAnswer(answer.paragraphIndex, { translation: event.currentTarget.value })}
					></textarea>
				</article>
			{/each}
		</div>
		{#if form?.error}
			<p class="mt-5 text-sm text-destructive" role="alert">{form.error}</p>
		{/if}
		<footer class="mt-8 flex justify-end">
			<Button type="submit" disabled={!allComplete || submitting}
				><Send />{submitting ? t(lang, "translate.draft.saving") : t(lang, "translate.draft.submit")}</Button
			>
		</footer>
	</form>
</div>

{#if candidatePickerIndex !== null}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
		role="presentation"
		onclick={(event) => { if (event.currentTarget === event.target) candidatePickerIndex = null; }}
	>
		<div
			class="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl border border-border bg-background p-5 shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-label={t(lang, "translate.draft.choose")}
		>
			<div class="mb-5 flex items-center justify-between">
				<h2 class="font-serif text-2xl">{t(lang, "translate.draft.choose")}</h2>
				<Button variant="ghost" onclick={() => (candidatePickerIndex = null)}>{t(lang, "translate.draft.close")}</Button>
			</div>
			<div class="space-y-3">
				{#each data.attempt.candidates[candidatePickerIndex] as candidate, candidateIndex}
					<button
						type="button"
						onclick={() => { updateAnswer(Number(candidatePickerIndex), { candidateIndex }); candidatePickerIndex = null; }}
						class="flex w-full gap-3 rounded-xl border border-border p-4 text-left hover:bg-foreground/[0.035]"
					>
						<span class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border"
							>{#if answers[candidatePickerIndex]?.candidateIndex === candidateIndex}
								<Check size={13} />
							{/if}</span
						>
						<span class="font-prose text-lg leading-relaxed">{candidate}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}
