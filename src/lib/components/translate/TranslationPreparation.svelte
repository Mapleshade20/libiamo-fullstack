<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Clock from "@lucide/svelte/icons/clock";
import Gem from "@lucide/svelte/icons/gem";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Star from "@lucide/svelte/icons/star";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { handlePreparationActionResult } from "$lib/client/quest-hall/preparation-actions";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { INTERACTION_TYPE_LABELS, UI_VARIANT_LABELS } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";

export interface TranslationPreparationTemplate {
	id: number;
	title: string;
	description: string | null;
	difficulty: number;
	pointReward: number;
	gemReward: number;
	estimatedWords: number | null;
}

interface Props {
	template: TranslationPreparationTemplate;
	attempt: { workflowPhase: string } | null;
	blockedReason: "missing-native-language" | "same-language" | null;
	lang: LanguageCode;
	form?: { error?: string } | null;
	mode?: "page" | "pane";
	backHref?: string;
	backLabel?: string;
	onback?: () => void;
}

let {
	template,
	attempt,
	blockedReason,
	lang,
	form = null,
	mode = "page",
	backHref = `${base}/`,
	backLabel = t(lang, "task.returnToHall"),
	onback,
}: Props = $props();

let starting = $state(false);
let retaking = $state(false);
let embeddedError = $state<string | null>(null);
let isDraft = $derived(!attempt || attempt.workflowPhase === "draft");
let isComplete = $derived(attempt?.workflowPhase === "completed");
let primaryHref = $derived(isDraft ? `${base}/translate/${template.id}/attempt` : `${base}/translate/${template.id}/feedback`);
let primaryLabel = $derived(
	!attempt
		? t(lang, "translate.details.begin")
		: attempt.workflowPhase === "draft"
			? t(lang, "translate.details.continueDraft")
			: isComplete
				? t(lang, "translate.details.review")
				: t(lang, "translate.details.continueEvaluation"),
);
let startAction = $derived(`${base}/translate/${template.id}?/start`);
let retakeAction = $derived(`${base}/translate/${template.id}?/retake`);

function difficultyLabel(level: number): string {
	return (
		[t(lang, "task.difficulty.beginner"), t(lang, "task.difficulty.intermediate"), t(lang, "task.difficulty.advanced")][level - 1] ??
		`${t(lang, "hall.difficulty")} ${level}`
	);
}
</script>

<section class="translation-preparation" class:is-pane={mode === "pane"} aria-labelledby="translation-preparation-title">
	{#if onback}
		<button type="button" class="back-link" onclick={onback}>
			<ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" />
			<span>{backLabel}</span>
		</button>
	{:else}
		<a href={backHref} class="back-link">
			<ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" />
			<span>{backLabel}</span>
		</a>
	{/if}

	<div class="preparation-body">
		<div>
			<div class="badge-line">
				{#if isComplete}
					<Badge class="border-green-500/20 bg-green-500/10 text-[10px] font-bold uppercase tracking-widest text-green-600 hover:bg-green-500/10">
						{t(lang, "task.completed")}
					</Badge>
				{/if}
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest">{UI_VARIANT_LABELS.translator}</Badge>
				<Badge variant="outline" class="text-[10px] font-bold uppercase tracking-widest">{INTERACTION_TYPE_LABELS.translate}</Badge>
				<span class="difficulty">{difficultyLabel(template.difficulty)}</span>
			</div>
			{#if mode === "pane"}
				<h2 id="translation-preparation-title">{template.title}</h2>
			{:else}
				<h1 id="translation-preparation-title">{template.title}</h1>
			{/if}
		</div>

		{#if template.description}
			<p class="description">{template.description}</p>
		{/if}

		{#if blockedReason}
			<div class="blocked-note">
				<AlertCircle class="mt-0.5 shrink-0" size={17} aria-hidden="true" />
				<p>
					{blockedReason === "same-language"
						? t(lang, "translate.details.sameLanguage")
						: t(lang, "translate.details.missingNative")}
				</p>
			</div>
		{/if}

		{#if form?.error || embeddedError}
			<p class="form-error" role="alert">{form?.error ?? embeddedError}</p>
		{/if}

		<div class="preparation-footer">
			<div class="footer-rule"></div>
			<div class="footer-content">
				<div class="rewards">
					<span><Star size={14} strokeWidth={1.5} aria-hidden="true" />{template.pointReward} {t(lang, "task.points")}</span>
					<span><Gem size={14} strokeWidth={1.5} aria-hidden="true" />{template.gemReward} {t(lang, "task.gems")}</span>
					{#if template.estimatedWords}
						<span><Clock size={14} strokeWidth={1.5} aria-hidden="true" />~{template.estimatedWords} {t(lang, "task.words")}</span>
					{/if}
				</div>

				{#if blockedReason}
					<Button href={`${base}/profile`} variant="outline" class="min-h-11 w-full justify-center sm:w-auto">
						<AlertCircle size={14} aria-hidden="true" />
						{t(lang, "translate.details.settings")}
					</Button>
				{:else if !attempt}
					<form
						method="POST"
						action={startAction}
						use:enhance={({ cancel }) => {
							if (starting) {
								cancel();
								return;
							}
							embeddedError = null;
							starting = true;
							return async ({ result, update }) => {
								try {
									if (mode === "pane") embeddedError = await handlePreparationActionResult(result, update, t(lang, "hall.menu.preparationError"));
									else await update();
								} finally {
									starting = false;
								}
							};
						}}
						class="w-full sm:w-56"
					>
						<Button type="submit" disabled={starting} aria-busy={starting} class="min-h-11 w-full justify-center px-4 sm:px-8">
							{#if starting}
								<LoaderCircle class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
							{/if}
							{starting ? t(lang, "translate.details.preparing") : primaryLabel}
						</Button>
						<span class="sr-only" role="status" aria-live="polite">{starting ? t(lang, "translate.details.preparing") : ""}</span>
					</form>
				{:else}
					<div class="continue-actions">
						<Button href={primaryHref} class="min-h-11 w-full justify-center px-4 sm:w-auto sm:px-8">{primaryLabel}</Button>
						{#if !isDraft}
							<form
								method="POST"
								action={retakeAction}
								use:enhance={({ cancel }) => {
									if (retaking || !confirm(t(lang, "translate.details.restartConfirm"))) {
										cancel();
										return;
									}
									embeddedError = null;
									retaking = true;
									return async ({ result, update }) => {
										try {
											if (mode === "pane") embeddedError = await handlePreparationActionResult(result, update, t(lang, "hall.menu.preparationError"));
											else await update();
										} finally {
											retaking = false;
										}
									};
								}}
								class="w-full sm:w-auto"
							>
								<Button type="submit" variant="ghost" disabled={retaking} aria-busy={retaking} class="min-h-11 w-full justify-center sm:w-auto">
									<RotateCcw size={14} aria-hidden="true" />
									{isComplete ? t(lang, "translate.details.tryAgain") : t(lang, "translate.details.abandon")}
								</Button>
							</form>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if isComplete && mode === "pane"}
		<div class="completion-watermark" aria-hidden="true"><CheckCircle2 size={280} strokeWidth={1} /></div>
	{/if}
</section>

<style>
.translation-preparation {
	position: relative;
	z-index: 1;
	display: flex;
	min-height: calc(100vh - 8rem);
	min-width: 0;
	flex-direction: column;
}

.translation-preparation.is-pane {
	min-height: clamp(32rem, 68vh, 44rem);
	overflow: hidden;
	padding: clamp(1.1rem, 3vw, 2rem);
}

.back-link {
	display: inline-flex;
	min-height: 44px;
	width: fit-content;
	align-items: center;
	gap: 0.5rem;
	border: 0;
	background: transparent;
	font-size: 0.78rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--muted-foreground);
	cursor: pointer;
	transition: color 160ms ease;
}

.back-link:hover {
	color: var(--foreground);
}

.back-link:focus-visible {
	outline: 2px solid var(--ring);
	outline-offset: 3px;
}

.preparation-body {
	display: flex;
	margin-top: clamp(1.75rem, 5vw, 3rem);
	min-width: 0;
	flex: 1;
	flex-direction: column;
}

.badge-line {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
	margin-bottom: 1rem;
}

.difficulty {
	font-size: 0.625rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.1em;
	color: var(--muted-foreground);
}

h1 {
	font-family: var(--font-serif);
	font-size: clamp(1.75rem, 4vw, 2.5rem);
	font-weight: 500;
	line-height: 1.12;
	overflow-wrap: anywhere;
}

.description {
	margin-top: 2rem;
	font-size: 1rem;
	line-height: 1.7;
	color: var(--muted-foreground);
}

.blocked-note {
	display: flex;
	gap: 0.75rem;
	margin-top: 2.5rem;
	border: 1px solid #f1d49a;
	border-radius: 0.375rem;
	padding: 1rem;
	background: #fff8e8;
	font-size: 0.875rem;
	color: #6f4f17;
}

.form-error {
	margin-top: 1.25rem;
	font-size: 0.875rem;
	color: var(--destructive);
}

.preparation-footer {
	margin-top: auto;
	padding-top: 3rem;
	padding-bottom: 1rem;
}

.footer-rule {
	height: 1px;
	background: var(--border);
}

.footer-content {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	padding-top: 1.5rem;
}

.rewards {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem 1rem;
	font-size: 0.875rem;
	color: var(--muted-foreground);
}

.rewards span {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
}

.continue-actions {
	display: flex;
	width: 100%;
	min-width: 0;
	flex-direction: column;
	gap: 0.5rem;
}

.completion-watermark {
	position: absolute;
	right: -5rem;
	top: -4rem;
	z-index: -1;
	color: color-mix(in oklab, #278553 7%, transparent);
	pointer-events: none;
}

@media (min-width: 640px) {
	.footer-content {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}

	.continue-actions {
		width: auto;
		flex-direction: row;
		align-items: center;
		justify-content: flex-end;
	}
}

@media (prefers-reduced-motion: reduce) {
	.back-link {
		transition: none;
	}
}
</style>
