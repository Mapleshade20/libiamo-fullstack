<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Check from "@lucide/svelte/icons/check";
import Clock from "@lucide/svelte/icons/clock";
import Gem from "@lucide/svelte/icons/gem";
import Languages from "@lucide/svelte/icons/languages";
import Loader from "@lucide/svelte/icons/loader-circle";
import Save from "@lucide/svelte/icons/save";
import Send from "@lucide/svelte/icons/send";
import Star from "@lucide/svelte/icons/star";
import Trophy from "@lucide/svelte/icons/trophy";
import { invalidateAll } from "$app/navigation";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { type LanguageCode, t } from "$lib/i18n";
import { renderMarkdown } from "$lib/markdown";

type EvalHighlight = { key: string; type: "good" | "bad"; feedback: string };
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
let submitted = $state(false);
let submitError = $state<string | null>(null);

// Live evaluation state (after submit)
let liveEvaluation = $state<Evaluation | null>(null);
let visibleHighlightKeys = $state<Set<string>>(new Set());
let evaluating = $state(false);

// The effective evaluation to display
let evaluation = $derived<Evaluation | null>(liveEvaluation ?? savedEvaluation);

// Initialize once on mount
let initialized = false;
$effect(() => {
	if (initialized) return;
	initialized = true;
	if (data.attempt?.translations) {
		translations = { ...(data.attempt.translations as Record<string, string>) };
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

// Computed
let totalSentences = $derived(passages.reduce((sum, p) => sum + p.length, 0));
const translatedCount = $derived(Object.keys(translations).filter((k) => translations[k]?.trim()).length);
const allTranslated = $derived(translatedCount === totalSentences && totalSentences > 0);

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

function scoreColor(score?: string): string {
	if (!score) return "text-foreground";
	if (score === "A") return "text-green-600";
	if (score === "B") return "text-yellow-600";
	return "text-red-600";
}

async function handleSaveDraft() {
	saving = true;
	try {
		const form = new FormData();
		form.set("translations", JSON.stringify(translations));
		if (attemptId) form.set("attemptId", String(attemptId));
		await fetch("?/saveDraft", { method: "POST", body: form });
		await invalidateAll();
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

		if (res.ok) {
			await invalidateAll();
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
			try {
				const errData = await res.json();
				submitError = errData?.error ?? "Evaluation failed. Please try again.";
			} catch {
				submitError = "Evaluation failed. Please try again.";
			}
		}
	} catch {
		// Network error — reset to draft state so user can retry
		submitted = false;
		submitError = "Evaluation failed. Please try again.";
	} finally {
		evaluating = false;
		saving = false;
	}
}
</script>

<div class="fixed inset-0 bg-card"></div>

<div class="relative z-10 mx-auto max-w-2xl flex flex-col min-h-[calc(100vh-8rem)]">
	<!-- Back button -->
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
		<!-- Header -->
		<div>
			<div class="mb-4 flex flex-wrap items-center gap-2">
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest">
					<Languages size={12} class="mr-1" />
					Translation
				</Badge>
				<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"> {difficultyLabel(tpl.difficulty)} </span>
				{#if isDone || submitted}
					<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest bg-green-100 text-green-700 border-green-200">
						<Check size={10} class="mr-0.5" />
						Done
					</Badge>
				{/if}
			</div>
			<h1 class="font-serif text-3xl md:text-5xl text-foreground leading-tight">{tpl.title}</h1>
		</div>

		<!-- Evaluation summary (right below the title) -->
		{#if evaluation && !translating}
			<div class="mt-6 max-w-xl">
				<div class="p-5 rounded-xl bg-foreground/5 border border-border space-y-4">
					<div class="flex items-center gap-2 mb-2">
						<Trophy size={14} strokeWidth={1.5} class="text-muted-foreground" />
						<h2 class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Evaluation</h2>
					</div>
					{#if evaluation.overallScore}
						<div class="flex items-center gap-3">
							<span class="text-4xl font-serif {scoreColor(evaluation.overallScore)}">{evaluation.overallScore}</span>
						</div>
					{/if}
					{#if evaluation.overallFeedback}
						<p class="text-sm text-muted-foreground leading-relaxed">{evaluation.overallFeedback}</p>
					{/if}
				</div>
			</div>
		{/if}

		{#if !translating}
			<!-- ═══ Preview Mode ═══ -->
			{#if tpl.description}
				<p class="mt-8 max-w-xl text-base font-light leading-relaxed text-muted-foreground">{tpl.description}</p>
			{/if}

			{#if isDone && passages.length > 0}
				<!-- Annotated translation view (shown when evaluated/submitted) -->
				<div class="mt-10">
					<h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Your Translation</h2>
					<div class="space-y-4 max-w-xl">
						{#each passages as paragraph, pi}
							<div class="space-y-1">
								{#each paragraph as sentence, si}
									{@const key = sentenceKey(pi, si)}
									{@const highlight = getHighlight(key)}
									{@const isAnnotated = visibleHighlightKeys.has(key)}
									{@const translation = translations[key]}
									<div>
										<p class="text-base font-light leading-relaxed text-foreground">{sentence}</p>
										{#if translation}
											<div
												class="ml-4 pl-3 border-l-2 py-1
												{highlight && isAnnotated
													? (highlight.type === 'good'
														? 'border-green-400 bg-green-50/70'
														: 'border-red-400 bg-red-50/70')
													: 'border-foreground/10'}"
											>
												<p
													class="text-sm italic
													{highlight && isAnnotated
														? (highlight.type === 'good' ? 'text-green-800' : 'text-red-800')
														: 'text-muted-foreground'}"
												>
													{translation}
												</p>
												{#if highlight && isAnnotated}
													<div
														class="mt-1.5 text-xs leading-relaxed
														{highlight.type === 'good' ? 'text-green-700' : 'text-red-700'}"
													>
														{highlight.feedback}
													</div>
												{/if}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{:else if passages.length > 0}
				<!-- Plain source text (not yet done) -->
				<div class="mt-10">
					<h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Source Text</h2>
					<div class="space-y-4 max-w-xl">
						{#each passages as paragraph, pi}
							<p class="text-base font-light leading-relaxed text-foreground">
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
					<div class="prose prose-neutral max-w-xl text-base font-light leading-relaxed">{@html renderMarkdown(tpl.materialsMd)}</div>
				</div>
			{/if}
		{:else}
			<!-- ═══ Translation Mode ═══ -->
			{#if totalSentences > 0}
				<div class="mt-8">
					<!-- Progress bar (hidden after submit) -->
					{#if !submitted}
						<div class="mb-6">
							<div class="flex items-center justify-between mb-2">
								<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground"> {translatedCount}/{totalSentences} sentences </span>
								<span class="text-xs text-muted-foreground"> {Math.round((translatedCount / totalSentences) * 100)}% </span>
							</div>
							<div class="h-1.5 w-full bg-border rounded-full overflow-hidden">
								<div
									class="h-full bg-foreground rounded-full transition-all duration-500"
									style="width: {(translatedCount / totalSentences) * 100}%"
								></div>
							</div>
						</div>
					{/if}

					<!-- Evaluation summary in translation mode (compact) -->
					{#if evaluation && submitted}
						<div class="mb-6 p-4 rounded-xl bg-foreground/5 border border-border space-y-3">
							<div class="flex items-center gap-2">
								<Trophy size={14} strokeWidth={1.5} class="text-muted-foreground" />
								<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Evaluation</span>
								{#if evaluating}
									<Loader size={14} class="animate-spin text-muted-foreground" />
								{/if}
							</div>
							{#if evaluation.overallScore}
								<div class="flex items-center gap-3">
									<span class="text-4xl font-serif {scoreColor(evaluation.overallScore)}">{evaluation.overallScore}</span>
								</div>
							{/if}
							{#if evaluation.overallFeedback}
								<p class="text-sm text-muted-foreground leading-relaxed">{evaluation.overallFeedback}</p>
							{/if}
						</div>
					{/if}

					<!-- Passages with inline translation & annotations -->
					<div class="space-y-6 max-w-xl">
						{#each passages as paragraph, pi}
							<div class="space-y-1">
								{#each paragraph as sentence, si}
									{@const key = sentenceKey(pi, si)}
									{@const done = translations[key]?.trim()}
									{@const highlight = getHighlight(key)}
									{@const isAnnotated = visibleHighlightKeys.has(key)}
									<div class="group">
										<!-- Source sentence -->
										<div
											role="button"
											tabindex={submitted ? -1 : 0}
											onclick={() => { if (!submitted) toggleSentence(key); }}
											onkeydown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !submitted) { e.preventDefault(); toggleSentence(key); } }}
											class="w-full text-left rounded-lg px-3 py-2 transition-colors {submitted ? 'cursor-default' : 'cursor-pointer'} {done && !submitted
												? 'bg-foreground/5'
												: ''} {activeKey === key && !submitted
												? 'ring-1 ring-foreground/20'
												: ''}"
										>
											<span class="text-base font-light leading-relaxed text-foreground">{sentence}</span>
										</div>

										<!-- Translation input (expanded, only before submit) -->
										{#if activeKey === key && !submitted}
											<div class="mt-1 ml-4 pl-3 border-l-2 border-foreground/20">
												<textarea
													class="w-full min-h-[60px] resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30"
													placeholder="Enter your translation..."
													bind:value={translations[key]}
													rows={2}
												></textarea>
											</div>
										{/if}

										<!-- Show translation with annotation (after submit) -->
										{#if done && submitted}
											<div
												class="ml-4 pl-3 border-l-2 py-1 transition-all duration-500
												{highlight && isAnnotated
													? (highlight.type === 'good'
														? 'border-green-400 bg-green-50/70'
														: 'border-red-400 bg-red-50/70')
													: submitted
														? 'border-foreground/10'
														: 'border-foreground/10'}"
											>
												<p
													class="text-sm italic
													{highlight && isAnnotated
														? (highlight.type === 'good' ? 'text-green-800' : 'text-red-800')
														: 'text-muted-foreground'}"
												>
													{translations[key]}
												</p>
												<!-- Annotation feedback -->
												{#if highlight && isAnnotated}
													<div
														class="mt-1.5 text-xs leading-relaxed animate-fade-in
														{highlight.type === 'good' ? 'text-green-700' : 'text-red-700'}"
													>
														{highlight.feedback}
													</div>
												{/if}
											</div>
										{/if}

										<!-- Show existing translation (when not expanded, before submit) -->
										{#if done && activeKey !== key && !submitted}
											<p class="ml-4 pl-3 border-l-2 border-foreground/10 text-sm text-muted-foreground py-1 italic">{translations[key]}</p>
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<!-- Footer -->
		<div class="mt-auto pt-12 pb-4">
			<div class="h-px w-full bg-border mb-6"></div>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<Star size={14} strokeWidth={1.5} />
						{tpl.pointReward}
						pts
					</span>
					<span class="flex items-center gap-1.5">
						<Gem size={14} strokeWidth={1.5} />
						{tpl.gemReward}
						gems
					</span>
					{#if tpl.estimatedWords}
						<span class="flex items-center gap-1.5"> <Clock size={14} strokeWidth={1.5} />~{tpl.estimatedWords} words </span>
					{/if}
				</div>
				<div class="flex gap-2">
					{#if !translating}
						<!-- Preview mode: only show Start if not done -->
						{#if canTranslate && !submitted}
							<Button onclick={startTranslation} class="px-8"> {attemptStatus === "draft" ? "Continue Translation" : "Start Translation"} </Button>
						{/if}
					{:else if !submitted}
						<!-- Translation mode (before submit): save & submit -->
						{#if submitError}
							<span class="text-sm text-red-600">{submitError}</span>
						{/if}
						<Button variant="outline" onclick={handleSaveDraft} disabled={saving}>
							<Save size={14} class="mr-1.5" />
							{saving ? "Saving..." : "Save Draft"}
						</Button>
						<Button onclick={handleSubmit} disabled={!allTranslated || saving}>
							<Send size={14} class="mr-1.5" />
							Submit
						</Button>
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
