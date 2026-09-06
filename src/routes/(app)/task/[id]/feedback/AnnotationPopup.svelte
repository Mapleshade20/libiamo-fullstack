<script lang="ts">
import BookmarkPlus from "@lucide/svelte/icons/bookmark-plus";
import X from "@lucide/svelte/icons/x";
import { onMount } from "svelte";
import { fade, scale } from "svelte/transition";
import { deserialize } from "$app/forms";
import { Button } from "$lib/components/ui/button";
import { Skeleton } from "$lib/components/ui/skeleton";
import type { AnnotationSpan } from "$lib/feedback/types";
import { renderMarkdown } from "$lib/markdown";

let {
	annotation,
	messageId,
	rect,
	sessionId,
	currentContext = "",
	previousContext = "",
	explanationMode = "issue",
	onClose,
}: {
	annotation: AnnotationSpan;
	messageId: number;
	rect: DOMRect;
	sessionId: number;
	currentContext?: string;
	previousContext?: string;
	explanationMode?: "issue" | "good_expression";
	onClose: () => void;
} = $props();

let explanation = $state<string | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);
let saveError = $state<string | null>(null);
let isSaving = $state(false);
let saveSuccess = $state(false);

// Position the popup near the annotation
const position = $derived(
	(() => {
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const popupWidth = Math.min(400, viewportWidth - 24);
		const maxPopupHeight = 500;

		let top = rect.bottom + 8;
		let left = rect.left;

		// Adjust if too far right
		if (left + popupWidth > viewportWidth - 12) {
			left = viewportWidth - popupWidth - 12;
		}
		if (left < 12) left = 12;

		// Prefer below, but flip above if there's not enough room
		const spaceBelow = viewportHeight - rect.bottom - 8;
		const spaceAbove = rect.top - 8;

		if (spaceBelow < maxPopupHeight && spaceAbove > spaceBelow) {
			top = Math.max(12, rect.top - maxPopupHeight - 8);
		} else {
			top = Math.min(top, viewportHeight - maxPopupHeight - 12);
		}
		top = Math.max(12, top);

		return { top, left };
	})(),
);

// Fetch explanation client-side only. Calling fetch from an eager reactive
// effect can run during SSR and causes SvelteKit warnings.
onMount(() => {
	void fetchExplanation();
});

function getCacheKey(): string {
	return `feedback-explanation-${sessionId}-${messageId}-${explanationMode}-${annotation.text.slice(0, 50)}`;
}

function getDefaultQuestion(): string {
	if (explanationMode === "good_expression") {
		return "Explain why this is a useful expression and give examples of how to use it.";
	}
	return "Explain this issue in detail with examples.";
}

async function fetchExplanation() {
	isLoading = true;
	error = null;

	// Check cache first
	const cacheKey = getCacheKey();
	const cached = sessionStorage.getItem(cacheKey);
	if (cached) {
		explanation = cached;
		isLoading = false;
		return;
	}

	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("itemText", annotation.text);
		formData.append("category", annotation.kind === "vocab" ? "vocabulary" : "grammar");
		formData.append("question", getDefaultQuestion());
		formData.append("currentContext", currentContext);
		formData.append("previousContext", previousContext);
		formData.append("explanationMode", explanationMode);

		const response = await fetch("?/followUp", {
			method: "POST",
			body: formData,
		});

		const result = deserialize(await response.text());

		if (result.type === "success" && result.data?.answer) {
			explanation = result.data.answer as string;
			// Cache the result
			sessionStorage.setItem(cacheKey, explanation);
		} else if (result.type === "failure") {
			error = (result.data?.error as string | undefined) ?? "The AI request failed. Please try again.";
		} else {
			error = "The AI request failed. Please try again.";
		}
	} catch (e) {
		console.error("Failed to fetch explanation:", e);
		error = e instanceof Error && e.message.trim() ? e.message : "Network error";
	} finally {
		isLoading = false;
	}
}

async function handleSaveNote() {
	if (!explanation) return;

	isSaving = true;
	saveSuccess = false;
	saveError = null;

	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("annotationText", annotation.text);
		formData.append("annotationKind", annotation.kind);
		formData.append("explanation", explanation);
		formData.append("currentContext", currentContext);
		formData.append("previousContext", previousContext);
		const response = await fetch("?/saveNote", {
			method: "POST",
			body: formData,
		});

		const result = deserialize(await response.text());

		if (result.type === "success") {
			saveSuccess = true;
			setTimeout(() => {
				saveSuccess = false;
			}, 2000);
		} else if (result.type === "failure") {
			saveError = (result.data?.error as string | undefined) ?? "Failed to save note";
		} else {
			saveError = "Failed to save note";
		}
	} catch (e) {
		console.error("Failed to save note:", e);
		saveError = e instanceof Error && e.message.trim() ? e.message : "Network error";
	} finally {
		isSaving = false;
	}
}

function handleBackdropClick(event: MouseEvent) {
	if (event.target === event.currentTarget) {
		onClose();
	}
}

const kindLabel = $derived(
	explanationMode === "good_expression"
		? "Good Expression"
		: annotation.kind === "grammar"
			? "Grammar"
			: annotation.kind === "vocab"
				? "Vocabulary"
				: annotation.kind === "delete"
					? "Unnecessary"
					: "Issue",
);

const kindColor = $derived(
	explanationMode === "good_expression"
		? "text-amber-700 bg-amber-50 border-amber-200"
		: annotation.kind === "grammar"
			? "text-red-600 bg-red-50 border-red-200"
			: annotation.kind === "vocab"
				? "text-blue-600 bg-blue-50 border-blue-200"
				: annotation.kind === "delete"
					? "text-gray-600 bg-gray-50 border-gray-200"
					: "text-gray-600 bg-gray-50 border-gray-200",
);
</script>

<!-- Backdrop -->
<button
	type="button"
	data-selection-ignore
	class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
	onclick={handleBackdropClick}
	transition:fade={{ duration: 150 }}
	aria-label="Close popup"
></button>

<!-- Popup card -->
<div
	data-selection-ignore
	class="fixed z-50 flex w-[calc(100vw-1.5rem)] max-w-[400px] flex-col overflow-hidden rounded-xl border border-[#e8e3db] bg-white shadow-2xl"
	style="top: {position.top}px; left: {position.left}px; max-height: calc(100vh - {position.top}px - 20px);"
	transition:scale={{ duration: 200, start: 0.95 }}
>
	<!-- Header -->
	<div class="flex items-center justify-between border-b border-[#e8e3db] p-4 bg-[#fdfcf9]">
		<div class="flex items-center gap-2">
			<span class="inline-block rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wider border {kindColor}"> {kindLabel} </span>
		</div>
		<button type="button" class="rounded-md p-1 text-[#6b6560] hover:bg-[#e8e3db] transition-colors" onclick={onClose}><X size={18} /></button>
	</div>

	<!-- Content -->
	<div class="p-4 overflow-y-auto flex-1">
		<!-- Annotated text -->
		<div class="mb-4 rounded-lg border border-[#e8e3db] bg-[#f5f2ed] p-3">
			<p class="font-prose text-sm font-medium text-[#2a2520] [overflow-wrap:anywhere]">"{annotation.text}"</p>
		</div>

		<!-- Explanation -->
		{#if isLoading}
			<div class="space-y-2">
				<Skeleton class="h-4 w-full" />
				<Skeleton class="h-4 w-5/6" />
				<Skeleton class="h-4 w-4/6" />
			</div>
		{:else if error}
			<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
		{:else if explanation}
			<div class="prose prose-sm max-w-none font-prose text-[#2a2520] [overflow-wrap:anywhere]">{@html renderMarkdown(explanation)}</div>
		{/if}
	</div>

	<!-- Footer -->
	{#if explanation}
		<div class="flex items-center justify-between gap-3 border-t border-[#e8e3db] bg-[#fdfcf9] p-4">
			{#if saveSuccess}
				<span class="text-sm text-green-600 font-medium">Saved to notes!</span>
			{:else if saveError}
				<span class="text-sm text-red-600 font-medium">{saveError}</span>
			{:else}
				<span class="text-xs text-[#9b8f85]"
					>{explanationMode === "good_expression" ? "Save this expression for later review" : "Save this for later review"}</span
				>
			{/if}
			<Button size="sm" variant="outline" onclick={handleSaveNote} disabled={isSaving || saveSuccess}>
				<BookmarkPlus size={14} class="mr-1.5" />
				{saveSuccess ? "Saved" : "Save to Notes"}
			</Button>
		</div>
	{/if}
</div>
