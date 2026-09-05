<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import Loader from "@lucide/svelte/icons/loader-circle";
import Sparkles from "@lucide/svelte/icons/sparkles";
import X from "@lucide/svelte/icons/x";
import { onMount } from "svelte";
import { deserialize } from "$app/forms";
import { Button } from "$lib/components/ui/button";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";

interface Props {
	show: boolean;
	taskTitle: string;
	taskDescription: string | null;
	taskObjectives: string[] | null;
	taskUi: string;
	taskInteractionType: string;
	nativeLanguage: string;
	targetLanguage: string;
	generateExpressionsAction?: string;
	evaluateTranslationAction?: string;
	onclose: () => void;
}

let {
	show,
	taskTitle,
	taskDescription,
	taskObjectives,
	taskUi,
	taskInteractionType,
	nativeLanguage,
	targetLanguage,
	generateExpressionsAction = "?/generateExpressions",
	evaluateTranslationAction = "?/evaluateTranslation",
	onclose,
}: Props = $props();

let lang = $derived(nativeLanguage as LanguageCode);

let expressions = $state<string[]>([]);
let userTranslations = $state<Record<number, string>>({});
let feedbacks = $state<Record<number, string>>({});
let corrections = $state<Record<number, string>>({});
let checking = $state<Record<number, boolean>>({});

let generating = $state(false);
let generateError = $state<string | null>(null);
let hasGenerated = $state(false);

let dialogEl = $state<HTMLDivElement>();
let mounted = $state(false);

onMount(() => {
	mounted = true;
	return () => {
		mounted = false;
	};
});

async function handleGenerate() {
	if (generating || hasGenerated) return;
	generating = true;
	generateError = null;

	try {
		const f = new FormData();
		f.set("title", taskTitle);
		if (taskDescription) f.set("description", taskDescription);
		if (taskObjectives && taskObjectives.length > 0) {
			f.set("objectives", JSON.stringify(taskObjectives));
		}
		f.set("ui", taskUi);
		f.set("interactionType", taskInteractionType);
		f.set("nativeLanguage", nativeLanguage);
		f.set("targetLanguage", targetLanguage);

		const res = await fetch(generateExpressionsAction, { method: "POST", body: f });
		const r = deserialize(await res.text()) as {
			type: string;
			data?: { expressions?: string[]; error?: string };
		};

		if (!mounted) return;

		if (r.type === "success" && r.data?.expressions) {
			expressions = r.data.expressions;
			hasGenerated = true;
		} else if (r.type === "failure") {
			generateError = (r.data as any)?.error ?? t(lang, "task.usefulExpressions.error");
		}
	} catch {
		if (!mounted) return;
		generateError = t(lang, "task.usefulExpressions.error");
	} finally {
		if (mounted) generating = false;
	}
}

async function handleCheck(idx: number) {
	const translation = userTranslations[idx]?.trim();
	if (!translation) return;

	checking = { ...checking, [idx]: true };
	feedbacks = { ...feedbacks, [idx]: "" };
	corrections = { ...corrections, [idx]: "" };

	try {
		const f = new FormData();
		f.set("sourceExpression", expressions[idx]);
		f.set("userTranslation", translation);
		f.set("nativeLanguage", nativeLanguage);
		f.set("targetLanguage", targetLanguage);

		const res = await fetch(evaluateTranslationAction, { method: "POST", body: f });
		const r = deserialize(await res.text()) as {
			type: string;
			data?: { feedback?: string; correction?: string; error?: string };
		};

		if (!mounted) return;

		if (r.type === "success" && r.data) {
			feedbacks = { ...feedbacks, [idx]: r.data.feedback ?? "" };
			corrections = { ...corrections, [idx]: r.data.correction ?? "" };
		} else if (r.type === "failure") {
			feedbacks = { ...feedbacks, [idx]: (r.data as any)?.error ?? t(lang, "task.usefulExpressions.error") };
		}
	} catch {
		if (!mounted) return;
		feedbacks = { ...feedbacks, [idx]: t(lang, "task.usefulExpressions.error") };
	} finally {
		if (mounted) checking = { ...checking, [idx]: false };
	}
}

function handleUserTranslationInput(idx: number, event: Event) {
	const textarea = event.target as HTMLTextAreaElement;
	const value = textarea.value.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);
	if (textarea.value !== value) textarea.value = value;
	userTranslations = { ...userTranslations, [idx]: value };
}

function handleClose() {
	onclose();
}

function handleBackdropClick(e: MouseEvent) {
	if (e.target === e.currentTarget) {
		handleClose();
	}
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Escape") {
		e.preventDefault();
		e.stopPropagation();
		handleClose();
		return;
	}
	// Simple focus trap: keep Tab within the dialog
	if (e.key === "Tab" && dialogEl) {
		const focusable = dialogEl.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
}

// Auto-generate when modal opens and we haven't yet (skip if already errored)
$effect(() => {
	if (show && !hasGenerated && !generating && !generateError) {
		handleGenerate();
	}
});

// Focus the dialog when it opens
$effect(() => {
	if (show && dialogEl) {
		dialogEl.focus();
	}
});

// Prevent body scroll when modal is open
$effect(() => {
	if (show) {
		document.body.style.overflow = "hidden";
	} else {
		document.body.style.overflow = "";
	}
	return () => {
		document.body.style.overflow = "";
	};
});
</script>

{#if show}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-labelledby="translate-modal-title"
			tabindex="-1"
			class="relative w-full max-w-lg mx-4 max-h-[85vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl animate-in zoom-in-95 outline-none"
			onkeydown={handleKeydown}
		>
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
				<div class="flex items-center gap-2">
					<Sparkles size={18} strokeWidth={1.5} class="text-foreground/70" />
					<h2 id="translate-modal-title" class="text-base font-semibold text-foreground">{t(lang, "task.usefulExpressions.title")}</h2>
				</div>
				<button
					type="button"
					onclick={handleClose}
					aria-label={t(lang, "task.usefulExpressions.close")}
					class="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
				>
					<X size={18} strokeWidth={1.5} />
				</button>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
				{#if generating}
					<div class="flex items-center gap-3 py-8 justify-center">
						<Loader size={20} strokeWidth={1.5} class="animate-spin text-muted-foreground" />
						<span class="text-sm text-muted-foreground">{t(lang, "task.usefulExpressions.generating")}</span>
					</div>
				{:else if generateError}
					<div class="py-6 text-center">
						<p class="text-sm text-red-500">{generateError}</p>
						<Button variant="outline" class="mt-3" onclick={handleGenerate}>{t(lang, "common.retry")}</Button>
					</div>
				{:else if expressions.length > 0}
					<p class="text-xs text-muted-foreground leading-relaxed">{t(lang, "task.usefulExpressions.instructions")}</p>

					{#each expressions as expr, idx}
						{@const feedback = feedbacks[idx]}
						{@const correction = corrections[idx]}
						{@const isChecking = checking[idx]}

						<div
							class="rounded-xl border border-border p-4 transition-colors {feedback
								? 'bg-foreground/5'
								: 'bg-background'}"
						>
							<!-- Source expression -->
							<p class="text-sm font-medium text-foreground leading-relaxed">{expr}</p>

							<!-- User's translation input -->
							<div class="mt-3">
								<textarea
									class="w-full min-h-[44px] resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
									aria-label={t(lang, "task.usefulExpressions.inputLabel").replace("{expression}", expr)}
									placeholder={t(lang, "task.usefulExpressions.inputPlaceholder")}
									rows={2}
									value={userTranslations[idx] ?? ""}
									maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
									oninput={(e) => handleUserTranslationInput(idx, e)}
									onkeydown={(e) => {
										if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
											e.preventDefault();
											handleCheck(idx);
										}
									}}
								></textarea>
							</div>

							<!-- Actions -->
							<div class="mt-2 flex items-center justify-between">
								<div class="flex-1">
									{#if isChecking}
										<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
											<Loader size={12} strokeWidth={1.5} class="animate-spin" />
											{t(lang, "task.usefulExpressions.translating")}
										</span>
									{:else if feedback}
										<div class="space-y-1">
											<p class="text-xs text-muted-foreground leading-relaxed">{feedback}</p>
											{#if correction}
												<p class="text-xs font-medium text-emerald-600 leading-relaxed">→ {correction}</p>
											{/if}
										</div>
									{/if}
								</div>

								<button
									type="button"
									onclick={() => handleCheck(idx)}
									disabled={isChecking || !userTranslations[idx]?.trim()}
									class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-foreground/10 px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/20 disabled:opacity-40"
								>
									<Check size={12} strokeWidth={2} />
									{t(lang, "task.usefulExpressions.check")}
								</button>
							</div>
						</div>
					{/each}
				{:else}
					<div class="py-6 text-center">
						<p class="text-sm text-muted-foreground">{t(lang, "task.usefulExpressions.error")}</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
@keyframes fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}
@keyframes zoom-in-95 {
	from {
		opacity: 0;
		transform: scale(0.95);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}
.animate-in {
	animation-duration: 0.2s;
	animation-fill-mode: both;
}
.fade-in {
	animation-name: fade-in;
}
.zoom-in-95 {
	animation-name: zoom-in-95;
}
</style>
