<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Check from "@lucide/svelte/icons/check";
import Clock from "@lucide/svelte/icons/clock";
import Gem from "@lucide/svelte/icons/gem";
import Languages from "@lucide/svelte/icons/languages";
import Save from "@lucide/svelte/icons/save";
import Send from "@lucide/svelte/icons/send";
import Star from "@lucide/svelte/icons/star";
import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import EvaluationSummary from "$lib/components/translate/EvaluationSummary.svelte";
import TranslationSentence from "$lib/components/translate/TranslationSentence.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { type LanguageCode, t } from "$lib/i18n";
import { renderMarkdown } from "$lib/markdown";
import type { ActionNotificationContent } from "$lib/notifications";

type EvalHighlight = { key: string; type: "good" | "bad"; feedback: string; grammarNote?: string; explanation?: string };
type Evaluation = {
	overallScore?: string;
	overallFeedback?: string;
	highlights?: EvalHighlight[];
};

let { data } = $props();
let tpl = $derived(data.template);
let lang = $derived(tpl.language as LanguageCode);

// translationBase is string[][] (paragraphs → sentences)
type Passage = string[][];
let passages = $derived<Passage>((tpl.translationBase as Passage) ?? []);

// Reactive values from attempt data
let attemptId = $derived<number | null>(data.attempt?.id ?? null);
let attemptStatus = $derived<string>(data.attempt?.status ?? "");
let canTranslate = $derived(attemptStatus === "" || attemptStatus === "draft");
let isDone = $derived(attemptStatus === "submitted" || attemptStatus === "evaluated");
let savedEvaluation = $derived<Evaluation | null>(data.attempt?.evaluation ?? null);

// State
let translating = $state(false);
let translations = $state<Record<string, string>>({});
let activeKey = $state<string | null>(null);
let saving = $state(false);
let saveError = $state<string | null>(null);
let submitted = $state(false);
let submitError = $state<string | null>(null);
let notificationKey = $state(0);
let actionNotification = $state<ActionNotificationContent | null>(null);

// Live evaluation state (after submit)
let liveEvaluation = $state<Evaluation | null>(null);
let visibleHighlightKeys = $state<Set<string>>(new Set());
let evaluating = $state(false);

// The effective evaluation to display
let evaluation = $derived<Evaluation | null>(liveEvaluation ?? savedEvaluation);

function isShort(text: string): boolean {
	const t = text.trim();
	if (t.length === 0) return true;
	const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff]/.test(t);
	if (hasCJK) return t.replace(/\s+/g, "").length <= 8;
	return t.split(/\s+/).length <= 3 || t.length <= 20;
}

// Computed
let totalSentences = $derived(passages.reduce((s, p) => s + p.length, 0));
let shortKeys = $derived(new Set(passages.flatMap((p, pi) => p.map((_, si) => sentenceKey(pi, si)).filter((_, si) => isShort(p[si])))));
let effectiveTotal = $derived(totalSentences - shortKeys.size);
let allShort = $derived(effectiveTotal === 0 && totalSentences > 0);
let sentenceReferences = $state<Record<string, string>>({});
let loadingReferences = $state<Set<string>>(new Set());
let referenceErrors = $state<Record<string, string>>({});
let qaHistories = $state<Record<string, { question: string; answer?: string }[]>>({});
let tutorAnswers = $state<Record<string, string>>({});
let loadingTutorAnswers = $state<Set<string>>(new Set());
let tutorErrors = $state<Record<string, string>>({});
let saveIndicator = $state<string | null>(null);
let lastSavedValue = $state<string>("");
let saveTimer = $state<ReturnType<typeof setTimeout> | null>(null);
let lastSaveError = $state(false);

function showActionNotification(variant: "success" | "error" | "info", title: string, message: string) {
	notificationKey += 1;
	actionNotification = { variant, title, message, key: notificationKey };
}

// localStorage persistence
let storageKey = $derived(`translate-${tpl.id}`);
function persistRefs() {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(`${storageKey}-refs`, JSON.stringify(sentenceReferences));
	} catch {
		/* ignore */
	}
}
function persistQA() {
	if (typeof localStorage === "undefined") return;
	try {
		localStorage.setItem(`${storageKey}-qa`, JSON.stringify(qaHistories));
	} catch {
		/* ignore */
	}
}

// Initialize once on mount
let initialized = false;
$effect(() => {
	if (initialized) return;
	initialized = true;
	if (data.attempt?.translations) {
		translations = { ...(data.attempt.translations as Record<string, string>) };
		lastSavedValue = JSON.stringify(translations);
	}
	// Restore ephemeral data from localStorage
	if (typeof localStorage !== "undefined") {
		try {
			const refs = localStorage.getItem(`${storageKey}-refs`);
			if (refs) sentenceReferences = JSON.parse(refs);
			const qa = localStorage.getItem(`${storageKey}-qa`);
			if (qa) qaHistories = JSON.parse(qa);
		} catch {
			/* ignore */
		}
	}
	if (attemptStatus === "draft") {
		translating = true;
	}
	if (isDone) {
		submitted = true;
		// Show all highlights immediately for loaded evaluations
		if (savedEvaluation?.highlights) {
			visibleHighlightKeys = new Set(savedEvaluation.highlights.map((h) => h.key));
		}
	}
});

const effectiveTranslatedCount = $derived(Object.entries(translations).filter(([k, v]) => !shortKeys.has(k) && v?.trim()).length);
const allTranslated = $derived(allShort || (effectiveTranslatedCount >= effectiveTotal && effectiveTotal > 0));
function sentenceKey(pi: number, si: number): string {
	return `${pi}-${si}`;
}

function startTranslation() {
	translating = true;
}

function backToPreview() {
	translating = false;
	activeKey = null;
}

function toggleSentence(key: string) {
	activeKey = activeKey === key ? null : key;
}

function difficultyLabel(level: number): string {
	return ["Beginner", "Intermediate", "Advanced"][level - 1] ?? `Level ${level}`;
}

function getHighlight(key: string): EvalHighlight | undefined {
	return evaluation?.highlights?.find((h) => h.key === key);
}
async function handleSaveDraft() {
	saving = true;
	saveError = null;
	try {
		const form = new FormData();
		form.set("translations", JSON.stringify(translations));
		if (attemptId) form.set("attemptId", String(attemptId));
		const res = await fetch("?/saveDraft", { method: "POST", body: form });
		const result = deserialize(await res.text());
		if (result.type !== "success") {
			const message =
				result.type === "failure"
					? ((result.data?.error as string | undefined) ?? "Failed to save draft. Please try again.")
					: "Failed to save draft. Please try again.";
			saveError = message;
			showActionNotification("error", "Unable to save draft", message);
			return;
		}
		await invalidateAll();
		showActionNotification("success", "Draft saved", "Your translation draft has been saved.");
	} catch {
		const message = "Failed to save draft. Please try again.";
		saveError = message;
		showActionNotification("error", "Unable to save draft", message);
	} finally {
		saving = false;
	}
}

async function handleSubmit() {
	if (!allTranslated) return;
	saving = true;
	evaluating = true;
	submitted = true;
	submitError = null;
	// Don't exit translation mode — stay for in-place annotation

	try {
		const form = new FormData();
		form.set("translations", JSON.stringify(translations));
		if (attemptId) form.set("attemptId", String(attemptId));
		const res = await fetch("?/submit", { method: "POST", body: form });
		const result = deserialize(await res.text());

		if (result.type === "success") {
			await invalidateAll();
			showActionNotification("success", "Translation submitted", "Your translation was submitted for evaluation.");
			// After invalidation, savedEvaluation should be populated
			// Animate highlights appearing one by one
			const evalResult = data.attempt?.evaluation as Evaluation | null;
			const evalToUse = evalResult?.highlights ? evalResult : null;

			if (evalToUse?.highlights && evalToUse.highlights.length > 0) {
				liveEvaluation = { ...evalToUse, highlights: [] };
				// Stagger highlight animations
				for (let i = 0; i < evalToUse.highlights.length; i++) {
					await new Promise((r) => setTimeout(r, 400));
					liveEvaluation = {
						...evalToUse,
						highlights: evalToUse.highlights.slice(0, i + 1),
					};
					visibleHighlightKeys = new Set([...visibleHighlightKeys, evalToUse.highlights[i].key]);
				}
			} else {
				liveEvaluation = evalToUse;
			}
		} else {
			// LLM failed — reset to draft state so user can retry
			submitted = false;
			const message =
				result.type === "failure"
					? ((result.data?.error as string | undefined) ?? "Evaluation failed. Please try again.")
					: "Evaluation failed. Please try again.";
			submitError = message;
			showActionNotification("error", "Evaluation failed", message);
		}
	} catch {
		// Network error — reset to draft state so user can retry
		const message = "Evaluation failed. Please try again.";
		submitted = false;
		submitError = message;
		showActionNotification("error", "Evaluation failed", message);
	} finally {
		evaluating = false;
		saving = false;
	}
}
async function handleShowReference(key: string, sourceSentence: string) {
	loadingReferences = new Set([...loadingReferences, key]);
	referenceErrors = { ...referenceErrors, [key]: "" };
	try {
		const form = new FormData();
		form.set("sourceSentence", sourceSentence);
		form.set("language", lang);
		const res = await fetch("?/translateSentence", { method: "POST", body: form });
		const r = deserialize(await res.text()) as { type: string; data?: Record<string, any> };
		if (r.type === "success" && r.data) {
			sentenceReferences = { ...sentenceReferences, [key]: r.data.translation as string };
			persistRefs();
		} else {
			referenceErrors = { ...referenceErrors, [key]: r.data?.error ?? "Failed to translate. You may need to configure your own API key." };
		}
	} catch {
		referenceErrors = { ...referenceErrors, [key]: "Failed to connect. You may need to configure your own API key." };
	} finally {
		loadingReferences = new Set([...loadingReferences].filter((k) => k !== key));
	}
}
function findSourceSentence(key: string): string {
	for (const para of passages) {
		for (let si = 0; si < para.length; si++) {
			if (sentenceKey(passages.indexOf(para), si) === key) return para[si];
		}
	}
	return "";
}
async function handleAskTutor(key: string, question: string, history: { question: string; answer?: string }[]) {
	const highlight = getHighlight(key);
	if (!highlight) return;
	loadingTutorAnswers = new Set([...loadingTutorAnswers, key]);
	tutorErrors = { ...tutorErrors, [key]: "" };
	try {
		// Build context from previous Q&A
		let context = "";
		if (history.length > 1) {
			context = "\n\nPrevious conversation:\n";
			for (const qa of history.slice(0, -1)) {
				context += `Q: ${qa.question}\nA: ${qa.answer ?? "(no answer yet)"}\n`;
			}
		}
		const form = new FormData();
		form.set("sourceSentence", findSourceSentence(key));
		form.set("userTranslation", translations[key] ?? "");
		form.set("feedback", highlight.feedback);
		form.set("question", question + context);
		form.set("language", lang);
		const res = await fetch("?/askTutor", { method: "POST", body: form });
		const r = deserialize(await res.text()) as { type: string; data?: Record<string, any> };
		if (r.type === "success" && r.data) {
			tutorAnswers = { ...tutorAnswers, [key]: r.data.answer as string };
		} else {
			tutorErrors = { ...tutorErrors, [key]: r.data?.error ?? "Failed to get answer. You may need to configure your own API key." };
		}
	} catch {
		tutorErrors = { ...tutorErrors, [key]: "Failed to connect. You may need to configure your own API key." };
	} finally {
		loadingTutorAnswers = new Set([...loadingTutorAnswers].filter((k) => k !== key));
	}
}
async function handleBlur() {
	const cv = JSON.stringify(translations);
	if (cv === lastSavedValue) return;
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(async () => {
		const vts = JSON.stringify(translations);
		if (vts === lastSavedValue) return;
		try {
			saveIndicator = "Saving...";
			const form = new FormData();
			form.set("translations", JSON.stringify(translations));
			if (attemptId) form.set("attemptId", String(attemptId));
			const res = await fetch("?/saveDraft", { method: "POST", body: form });
			if (res.ok) {
				lastSavedValue = vts;
				saveIndicator = "Saved";
				lastSaveError = false;
				setTimeout(() => {
					if (saveIndicator === "Saved") saveIndicator = null;
				}, 2000);
				await invalidateAll();
			} else {
				lastSaveError = true;
				saveIndicator = null;
			}
		} catch {
			lastSaveError = true;
			saveIndicator = null;
		}
	}, 500);
}
$effect(() => {
	return () => {
		if (saveTimer) clearTimeout(saveTimer);
	};
});
</script>

<svelte:head>
	<title>{tpl.title} · Translation · Libiamo</title>
	<meta name="description" content={`Translate and review “${tpl.title}” with targeted feedback.`}>
</svelte:head>
<ActionNotification notification={actionNotification} />
<div class="fixed inset-0 bg-card"></div>
<div class="task-stagger relative z-10 mx-auto max-w-2xl flex flex-col min-h-[calc(100vh-8rem)]">
	{#if translating}
		<button
			type="button"
			onclick={backToPreview}
			class="group flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
		>
			<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
			<span class="text-sm font-medium uppercase tracking-wide">{t(lang, "common.back")}</span>
		</button>
	{:else}
		<a href="/translate" class="group flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
			<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
			<span class="text-sm font-medium uppercase tracking-wide">{t(lang, "common.back")}</span>
		</a>
	{/if}
	<div class="mt-12 flex-1 flex flex-col">
		<div>
			<div class="mb-4 flex flex-wrap items-center gap-2">
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest"><Languages size={12} class="mr-1" />Translation</Badge>
				<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{difficultyLabel(tpl.difficulty)}</span>
				{#if isDone || submitted}
					<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest bg-green-100 text-green-700 border-green-200"
						><Check size={10} class="mr-0.5" />Done</Badge
					>
				{/if}
			</div>
			<h1 class="font-serif text-3xl md:text-5xl text-foreground leading-tight">{tpl.title}</h1>
		</div>
		{#if evaluation && !translating}
			<div class="mt-6 max-w-xl"><EvaluationSummary overallScore={evaluation.overallScore} overallFeedback={evaluation.overallFeedback} /></div>
		{/if}
		{#if !translating}
			{#if tpl.description}
				<p class="mt-8 max-w-xl text-base leading-relaxed text-muted-foreground">{tpl.description}</p>
			{/if}
			{#if isDone && passages.length > 0}
				<div class="mt-10">
					<h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Translation</h2>
					<div class="space-y-4 max-w-xl">
						{#each passages as paragraph, pi}
							<div class="space-y-1">
								{#each paragraph as sentence, si}
									{@const key = sentenceKey(pi, si)}
									<TranslationSentence
										{sentence}
										sentenceKey={key}
										translation={translations[key] ?? ""}
										highlight={getHighlight(key)}
										isAnnotated={visibleHighlightKeys.has(key)}
										isShort={shortKeys.has(key)}
										mode="submitted"
										isActive={false}
										reference={sentenceReferences[key]}
										loadingReference={loadingReferences.has(key)}
										onShowReference={() => handleShowReference(key, sentence)}
										tutorAnswer={tutorAnswers[key]}
										loadingTutorAnswer={loadingTutorAnswers.has(key)}
										tutorError={tutorErrors[key] ?? ""}
										onToggle={() => {}}
										onBlur={() => {}}
										onTranslationChange={() => {}}
										onAskTutor={(q: string, history: { question: string; answer?: string }[]) => handleAskTutor(key, q, history)}
										qaHistory={qaHistories[key] ?? []}
										onQaChange={(history) => { qaHistories = { ...qaHistories, [key]: history }; persistQA(); }}
									/>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{:else if passages.length > 0}
				<div class="mt-10">
					<h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Source Text</h2>
					<div class="space-y-4 max-w-xl">
						{#each passages as paragraph, pi}
							<p class="text-base leading-relaxed text-foreground">
								{#each paragraph as sentence, si}
									<span>{sentence}{si < paragraph.length - 1 ? " " : ""}</span>
								{/each}
							</p>
						{/each}
					</div>
				</div>
			{/if}
			{#if tpl.materialsMd}
				<div class="mt-10">
					<h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Background Material</h2>
					<div class="prose prose-neutral max-w-xl text-base leading-relaxed">{@html renderMarkdown(tpl.materialsMd)}</div>
				</div>
			{/if}
		{:else}
			{#if totalSentences > 0}
				<div class="mt-8">
					{#if allShort}
						<div class="mb-6 p-4 rounded-xl bg-foreground/5 border border-border">
							<p class="text-sm text-muted-foreground">
								All sentences in this section are short (excluded from evaluation). You can still translate them below.
							</p>
						</div>
					{/if}
					{#if !submitted && !allShort}
						<div class="mb-6">
							<div class="flex items-center justify-between mb-2">
								<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground"
									>{effectiveTranslatedCount}/{effectiveTotal}
									sentences</span
								>
								<span class="text-xs text-muted-foreground"
									>{effectiveTotal > 0 ? Math.round((effectiveTranslatedCount / effectiveTotal) * 100) : 0}%</span
								>
							</div>
							<div class="h-1.5 w-full bg-border rounded-full overflow-hidden">
								<div
									class="h-full bg-foreground rounded-full transition-all duration-500"
									style="width: {effectiveTotal > 0 ? (effectiveTranslatedCount / effectiveTotal) * 100 : 0}%"
								></div>
							</div>
						</div>
					{/if}
					{#if evaluation && submitted}
						<div class="mb-6"><EvaluationSummary overallScore={evaluation.overallScore} overallFeedback={evaluation.overallFeedback} compact /></div>
					{/if}
					<div class="space-y-6 max-w-xl">
						{#each passages as paragraph, pi}
							<div class="space-y-1">
								{#each paragraph as sentence, si}
									{@const key = sentenceKey(pi, si)}
									<TranslationSentence
										{sentence}
										sentenceKey={key}
										translation={translations[key] ?? ""}
										highlight={getHighlight(key)}
										isAnnotated={visibleHighlightKeys.has(key)}
										isShort={shortKeys.has(key)}
										mode={submitted ? "submitted" : "editing"}
										isActive={activeKey === key}
										reference={sentenceReferences[key]}
										loadingReference={loadingReferences.has(key)}
										onShowReference={() => handleShowReference(key, sentence)}
										tutorAnswer={tutorAnswers[key]}
										loadingTutorAnswer={loadingTutorAnswers.has(key)}
										tutorError={tutorErrors[key] ?? ""}
										onToggle={() => toggleSentence(key)}
										onBlur={handleBlur}
										onTranslationChange={(v: string) => { translations = { ...translations, [key]: v }; }}
										onAskTutor={(q: string, history: { question: string; answer?: string }[]) => handleAskTutor(key, q, history)}
										qaHistory={qaHistories[key] ?? []}
										onQaChange={(history) => { qaHistories = { ...qaHistories, [key]: history }; persistQA(); }}
									/>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
		<div class="mt-auto pt-12 pb-4">
			<div class="h-px w-full bg-border mb-6"></div>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5"><Star size={14} strokeWidth={1.5} />{tpl.pointReward} pts</span>
					<span class="flex items-center gap-1.5"><Gem size={14} strokeWidth={1.5} />{tpl.gemReward} gems</span>
					{#if tpl.estimatedWords}
						<span class="flex items-center gap-1.5"><Clock size={14} strokeWidth={1.5} />~{tpl.estimatedWords} words</span>
					{/if}
					{#if saveIndicator}
						<span class="text-xs text-muted-foreground animate-fade-in">{saveIndicator}</span>
					{/if}
					{#if lastSaveError}
						<span class="flex items-center gap-1 text-xs text-amber-600"><AlertCircle size={12} /> Auto-save failed</span>
					{/if}
				</div>
				<div class="flex gap-2">
					{#if !translating}
						{#if canTranslate && !submitted}
							<Button onclick={startTranslation} class="px-8">{attemptStatus === "draft" ? "Continue Translation" : "Start Translation"}</Button>
						{/if}
					{:else if !submitted}
						<Button variant="outline" onclick={handleSaveDraft} disabled={saving}
							><Save size={14} class="mr-1.5" />{saving ? "Saving..." : "Save Draft"}</Button
						>
						<Button onclick={handleSubmit} disabled={!allTranslated || saving}><Send size={14} class="mr-1.5" />Submit</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
<style>
@keyframes fade-in {
	from {
		opacity: 0;
		transform: translateY(-4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
.animate-fade-in {
	animation: fade-in 0.4s ease-out;
}
</style>
