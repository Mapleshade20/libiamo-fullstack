<script lang="ts">
import BookmarkPlus from "@lucide/svelte/icons/bookmark-plus";
import X from "@lucide/svelte/icons/x";
import { onMount } from "svelte";
import { fade, scale } from "svelte/transition";
import { deserialize } from "$app/forms";
import { Button } from "$lib/components/ui/button";
import { Skeleton } from "$lib/components/ui/skeleton";
import type { AnnotationSpan } from "$lib/feedback-types";
import { renderMarkdown } from "$lib/markdown";

let {
	annotation,
	messageId,
	rect,
	sessionId,
	currentContext = "",
	previousContext = "",
	onClose,
}: {
	annotation: AnnotationSpan;
	messageId: number;
	rect: DOMRect;
	sessionId: number;
	currentContext?: string;
	previousContext?: string;
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
		const popupWidth = 400;
		const popupHeight = 300;

		let top = rect.bottom + 8;
		let left = rect.left;

		// Adjust if too far right
		if (left + popupWidth > viewportWidth - 20) {
			left = viewportWidth - popupWidth - 20;
		}

		// Adjust if too far down
		if (top + popupHeight > viewportHeight - 20) {
			top = rect.top - popupHeight - 8;
		}

		return { top, left };
	})(),
);

// Fetch explanation client-side only. Calling fetch from an eager reactive
// effect can run during SSR and causes SvelteKit warnings.
onMount(() => {
	void fetchExplanation();
});

function getCacheKey(): string {
	return `feedback-explanation-${sessionId}-${annotation.text.slice(0, 50)}`;
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
		formData.append("question", "Explain this issue in detail with examples.");

		const response = await fetch("?/followUp", {
			method: "POST",
			body: formData,
		});

		const result = deserialize(await response.text());

		if (result.type === "success" && result.data?.answer) {
			explanation = result.data.answer as string;
			// Cache the result
			sessionStorage.setItem(cacheKey, explanation);
		} else {
			error = "Failed to load explanation";
		}
	} catch (e) {
		console.error("Failed to fetch explanation:", e);
		error = "Network error";
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
		formData.append("sourceMessageId", String(messageId));

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
		saveError = "Network error";
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
	annotation.kind === "grammar" ? "Grammar" : annotation.kind === "vocab" ? "Vocabulary" : annotation.kind === "delete" ? "Unnecessary" : "Issue",
);

const kindColor = $derived(
	annotation.kind === "grammar"
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
	class="fixed z-50 w-[400px] max-h-[500px] overflow-hidden rounded-xl border border-[#e8e3db] bg-white shadow-2xl"
	style="top: {position.top}px; left: {position.left}px;"
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
	<div class="p-4 overflow-y-auto max-h-[350px]">
		<!-- Annotated text -->
		<div class="mb-4 rounded-lg bg-[#f5f2ed] p-3 border border-[#e8e3db]">
			<p class="text-sm font-medium text-[#2a2520]">"{annotation.text}"</p>
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
			<div class="prose prose-sm max-w-none text-[#2a2520]">{@html renderMarkdown(explanation)}</div>
		{/if}
	</div>

	<!-- Footer -->
	{#if explanation}
		<div class="border-t border-[#e8e3db] p-4 bg-[#fdfcf9] flex items-center justify-between gap-3">
			{#if saveSuccess}
				<span class="text-sm text-green-600 font-medium">Saved to notes!</span>
			{:else if saveError}
				<span class="text-sm text-red-600 font-medium">{saveError}</span>
			{:else}
				<span class="text-xs text-[#9b8f85]">Save this for later review</span>
			{/if}
			<Button size="sm" variant="outline" onclick={handleSaveNote} disabled={isSaving || saveSuccess}>
				<BookmarkPlus size={14} class="mr-1.5" />
				{saveSuccess ? "Saved" : "Save to Notes"}
			</Button>
		</div>
	{/if}
</div>
