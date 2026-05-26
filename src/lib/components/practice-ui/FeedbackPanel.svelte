<script lang="ts">
import CheckCircle from "@lucide/svelte/icons/check-circle";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import X from "@lucide/svelte/icons/x";
import { deserialize, enhance } from "$app/forms";

type FeedbackItem = {
	text: string;
	checked: boolean;
};

type TutorFeedback = {
	objectiveResults: { text: string; grade: "A" | "B" | "C" }[];
	grammar: string[];
	vocabulary: string[];
	coherence: string[];
	summary: string;
};

type FollowUpState = {
	category: "grammar" | "vocabulary" | "coherence" | null;
	index: number | null;
	question: string;
	answer: string | null;
	loading: boolean;
};

let {
	feedback,
	sessionId,
	taskId,
	t = {} as Record<string, string>,
	collapsible = false,
	onClose = () => {},
	dark = false,
	existingBackContents = [] as string[],
	onNotesSaved = (_saved: string[]) => {},
}: {
	feedback: TutorFeedback;
	sessionId: number | null;
	taskId: string | number;
	t?: Record<string, string>;
	collapsible?: boolean;
	onClose?: () => void;
	dark?: boolean;
	existingBackContents?: string[];
	onNotesSaved?: (saved: string[]) => void;
} = $props();

const existingSet = $derived(new Set(existingBackContents));

// svelte-ignore state_referenced_locally
let grammarItems = $state<FeedbackItem[]>(feedback.grammar.filter((text) => !existingSet.has(text)).map((text) => ({ text, checked: false })));
// svelte-ignore state_referenced_locally
let vocabItems = $state<FeedbackItem[]>(feedback.vocabulary.filter((text) => !existingSet.has(text)).map((text) => ({ text, checked: false })));
// svelte-ignore state_referenced_locally
let cohereItems = $state<FeedbackItem[]>(feedback.coherence.filter((text) => !existingSet.has(text)).map((text) => ({ text, checked: false })));

// Re-filter when existingBackContents changes (e.g. after saving notes and re-opening)
$effect(() => {
	void existingSet;
	grammarItems = feedback.grammar.filter((text) => !existingSet.has(text)).map((text) => ({ text, checked: false }));
	vocabItems = feedback.vocabulary.filter((text) => !existingSet.has(text)).map((text) => ({ text, checked: false }));
	cohereItems = feedback.coherence.filter((text) => !existingSet.has(text)).map((text) => ({ text, checked: false }));
});
let isGenerating = $state(false);
let isCollapsed = $state(false);

// ── Follow-up state ──────────────────────────────────────────────
let followUp = $state<FollowUpState>({
	category: null,
	index: null,
	question: "",
	answer: null,
	loading: false,
});

function isFollowUpOpen(category: string, index: number) {
	return followUp.category === category && followUp.index === index;
}

function openFollowUp(category: "grammar" | "vocabulary" | "coherence", index: number) {
	if (isFollowUpOpen(category, index)) {
		closeFollowUp();
		return;
	}
	followUp = { category, index, question: "", answer: null, loading: false };
}

function closeFollowUp() {
	followUp = { category: null, index: null, question: "", answer: null, loading: false };
}

async function submitFollowUp(itemText: string, category: "grammar" | "vocabulary" | "coherence", question: string) {
	if (followUp.loading || !sessionId) return;
	followUp.loading = true;
	followUp.answer = null;
	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("itemText", itemText);
		formData.append("category", category);
		formData.append("question", question);
		const res = await fetch("?/followUp", { method: "POST", body: formData });
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			followUp.answer = (result.data as { answer?: string }).answer ?? null;
		}
	} catch (e) {
		console.error("Follow-up failed:", e);
	} finally {
		followUp.loading = false;
	}
}

const headerBg = $derived(dark ? "bg-[#313338]" : "bg-white");
const headerHover = $derived(dark ? "hover:bg-[#3B3D44]" : "hover:bg-gray-50");

const selectedCount = $derived(
	grammarItems.filter((i) => i.checked).length + vocabItems.filter((i) => i.checked).length + cohereItems.filter((i) => i.checked).length,
);

const totalItems = $derived(grammarItems.length + vocabItems.length + cohereItems.length);
const allChecked = $derived(totalItems > 0 && selectedCount === totalItems);

function toggleAll() {
	const setAll = !allChecked;
	grammarItems = grammarItems.map((i) => ({ ...i, checked: setAll }));
	vocabItems = vocabItems.map((i) => ({ ...i, checked: setAll }));
	cohereItems = cohereItems.map((i) => ({ ...i, checked: setAll }));
}
</script>

{#snippet followUpPopover(itemText: string, category: "grammar" | "vocabulary" | "coherence", index: number)}
	{#if isFollowUpOpen(category, index)}
		<div class="mt-1.5 rounded-lg border border-white/10 bg-white/5 p-3">
			{#if followUp.answer}
				<div class="flex items-start gap-2">
					<p class="flex-1 text-sm leading-relaxed whitespace-pre-wrap">{followUp.answer}</p>
					<button type="button" class="mt-0.5 shrink-0 opacity-60 hover:opacity-100" onclick={closeFollowUp} title="Dismiss"><X size={14} /></button>
				</div>
			{:else}
				<div class="flex flex-wrap gap-1.5 mb-2">
					<button
						type="button"
						class="rounded-full bg-white/10 px-2.5 py-1 text-xs transition-colors hover:bg-white/20"
						onclick={() => submitFollowUp(itemText, category, "why")}
					>
						{t.askWhy ?? "Why is this wrong?"}
					</button>
					<button
						type="button"
						class="rounded-full bg-white/10 px-2.5 py-1 text-xs transition-colors hover:bg-white/20"
						onclick={() => submitFollowUp(itemText, category, "examples")}
					>
						{t.askExamples ?? "Give me more examples"}
					</button>
				</div>
				<form
					class="flex gap-1.5"
					onsubmit={(e) => {
						e.preventDefault();
						const q = followUp.question.trim();
						if (q) submitFollowUp(itemText, category, q);
					}}
				>
					<input
						type="text"
						class="flex-1 min-w-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs placeholder:opacity-40"
						placeholder={t.askPlaceholder ?? "Ask a follow-up question..."}
						bind:value={followUp.question}
						disabled={followUp.loading}
					>
					<button
						type="submit"
						class="shrink-0 rounded-md bg-white/15 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-white/25 disabled:opacity-40"
						disabled={followUp.loading || !followUp.question.trim()}
					>
						{#if followUp.loading}
							<LoaderCircle size={14} class="animate-spin" />
						{:else}
							{t.askSubmit ?? "Ask"}
						{/if}
					</button>
				</form>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet bodyContent()}
	<h3 class="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">{t.overallFeedback ?? "Overall Feedback"}</h3>
	<p class="mb-6 whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-relaxed">{feedback.summary}</p>

	{#if feedback.objectiveResults && feedback.objectiveResults.length > 0}
		<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide opacity-70">{t.objectiveAssessment ?? "Objective Assessment"}</h3>
		<div class="mb-6 space-y-2">
			{#each feedback.objectiveResults as obj}
				<div class="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3">
					<span class="pr-4 text-sm leading-snug">{obj.text}</span>
					<span
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold {obj.grade === 'A'
							? 'bg-green-500 text-white'
							: obj.grade === 'B'
								? 'bg-yellow-400 text-black'
								: 'bg-red-500 text-white'}"
					>
						{obj.grade}
					</span>
				</div>
			{/each}
		</div>
	{/if}

	<div class="mb-4 flex items-center justify-between">
		<h3 class="text-xs font-semibold uppercase tracking-wide opacity-70">Create Notes</h3>
		{#if totalItems > 0}
			<button type="button" onclick={toggleAll} class="text-xs text-blue-400 hover:underline">{allChecked ? "Deselect All" : "Select All"}</button>
		{/if}
	</div>

	{#if totalItems > 0}
		<form
			method="POST"
			action="?/saveNotes"
			use:enhance={() => {
				isGenerating = true;
				return async ({ result }) => {
					isGenerating = false;
					if (result.type === "success") {
						const saved = [
							...grammarItems.filter((i) => i.checked).map((i) => i.text),
							...vocabItems.filter((i) => i.checked).map((i) => i.text),
							...cohereItems.filter((i) => i.checked).map((i) => i.text),
						];
						onNotesSaved(saved);
					}
				};
			}}
			class="space-y-4"
		>
			<input type="hidden" name="sessionId" value={sessionId}>
			<input type="hidden" name="taskId" value={taskId}>

			{#if grammarItems.length > 0}
				<div>
					<h4 class="mb-1 text-[11px] font-semibold text-amber-400 uppercase">Grammar</h4>
					{#each grammarItems as item, i}
						<div>
							<label class="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-white/5">
								<input type="checkbox" name="checkedItems" value="grammar|{item.text}" bind:checked={grammarItems[i].checked} class="mt-0.5">
								<span class="text-sm flex-1">{item.text}</span>
								<button
									type="button"
									class="ml-1 shrink-0 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
									title={t.askFollowUp ?? "Ask about this"}
									onclick={(e) => { e.preventDefault(); e.stopPropagation(); openFollowUp("grammar", i); }}
								>
									<MessageCircleQuestion size={14} />
								</button>
							</label>
							{@render followUpPopover(item.text, "grammar", i)}
						</div>
					{/each}
				</div>
			{/if}

			{#if vocabItems.length > 0}
				<div>
					<h4 class="mb-1 text-[11px] font-semibold text-blue-400 uppercase">Vocabulary</h4>
					{#each vocabItems as item, i}
						<div>
							<label class="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-white/5">
								<input type="checkbox" name="checkedItems" value="vocabulary|{item.text}" bind:checked={vocabItems[i].checked} class="mt-0.5">
								<span class="text-sm flex-1">{item.text}</span>
								<button
									type="button"
									class="ml-1 shrink-0 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
									title={t.askFollowUp ?? "Ask about this"}
									onclick={(e) => { e.preventDefault(); e.stopPropagation(); openFollowUp("vocabulary", i); }}
								>
									<MessageCircleQuestion size={14} />
								</button>
							</label>
							{@render followUpPopover(item.text, "vocabulary", i)}
						</div>
					{/each}
				</div>
			{/if}

			{#if cohereItems.length > 0}
				<div>
					<h4 class="mb-1 text-[11px] font-semibold text-purple-400 uppercase">Coherence</h4>
					{#each cohereItems as item, i}
						<div>
							<label class="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors hover:bg-white/5">
								<input type="checkbox" name="checkedItems" value="coherence|{item.text}" bind:checked={cohereItems[i].checked} class="mt-0.5">
								<span class="text-sm flex-1">{item.text}</span>
								<button
									type="button"
									class="ml-1 shrink-0 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100"
									title={t.askFollowUp ?? "Ask about this"}
									onclick={(e) => { e.preventDefault(); e.stopPropagation(); openFollowUp("coherence", i); }}
								>
									<MessageCircleQuestion size={14} />
								</button>
							</label>
							{@render followUpPopover(item.text, "coherence", i)}
						</div>
					{/each}
				</div>
			{/if}

			<button
				type="submit"
				disabled={selectedCount === 0 || isGenerating}
				class="flex w-full items-center justify-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/25 disabled:opacity-40"
			>
				{#if isGenerating}
					Generating...
				{:else}
					<CheckCircle size={16} />
					Save {selectedCount} Note{selectedCount !== 1 ? "s" : ""}
				{/if}
			</button>
		</form>
	{:else}
		<p class="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-sm opacity-60">
			{t.noIssuesFound ?? "No specific issues found — excellent work!"}
		</p>
	{/if}
{/snippet}

{#if collapsible}
	<div class="feedback-panel rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
		<div
			role="button"
			tabindex="0"
			class="sticky top-0 z-10 flex w-full cursor-pointer items-center justify-between px-5 py-3 text-left {headerBg} {headerHover} transition-colors"
			onclick={() => (isCollapsed = !isCollapsed)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					isCollapsed = !isCollapsed;
				}
			}}
		>
			<div class="flex items-center gap-3">
				<CheckCircle size={18} class="text-green-400" />
				<span class="text-sm font-semibold">{t.tutorReport ?? "Tutor Feedback"}</span>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="rounded-md px-3 py-1 text-xs font-medium transition-colors hover:bg-white/10"
					onclick={(e) => {
						e.stopPropagation();
						onClose();
					}}
				>
					{t.closeReview ?? "Close"}
				</button>
				<span class="text-xs opacity-50 transition-transform" class:rotate-180={!isCollapsed}>{isCollapsed ? '▶' : '▼'}</span>
			</div>
		</div>

		{#if !isCollapsed}
			<div class="px-5 pb-5">{@render bodyContent()}</div>
		{/if}
	</div>
{:else}
	<div class="overflow-y-auto px-6 py-5">{@render bodyContent()}</div>
{/if}
