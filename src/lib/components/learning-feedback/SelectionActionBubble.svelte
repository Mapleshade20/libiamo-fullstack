<script lang="ts">
import BookmarkPlus from "@lucide/svelte/icons/bookmark-plus";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import { onMount } from "svelte";
import { fade, scale } from "svelte/transition";
import type { LearningSelection, SaveSelectionResult } from "./types";

type CapturedSelection = LearningSelection & {
	top: number;
	left: number;
	key: string;
};

type SaveStatus = {
	message: string;
	kind: "success" | "empty" | "error";
	top: number;
	left: number;
};

let {
	sourceKey,
	onAskSelection,
	onSaveSelection,
}: {
	sourceKey: string;
	onAskSelection: (selection: LearningSelection) => void;
	onSaveSelection: (selection: LearningSelection) => Promise<SaveSelectionResult>;
} = $props();

let captured = $state<CapturedSelection | null>(null);
let saveStatus = $state<SaveStatus | null>(null);
let isSaving = $state(false);
let savedKeys = $state(new Set<string>());
let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function getElementFromNode(node: Node | null): Element | null {
	if (!node) return null;
	return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function getSelectableElements(range: Range): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>("[data-learning-selectable]")).filter((element) => {
		try {
			return range.intersectsNode(element);
		} catch {
			return false;
		}
	});
}

function dismissSelection() {
	captured = null;
	window.getSelection()?.removeAllRanges();
}

function captureCurrentSelection() {
	if (isSaving) return;
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		captured = null;
		return;
	}
	const anchor = getElementFromNode(selection.anchorNode);
	const focus = getElementFromNode(selection.focusNode);
	const text = selection.toString().trim();
	if (text.length < 2 || anchor?.closest("[data-selection-ignore]") || focus?.closest("[data-selection-ignore]")) {
		captured = null;
		return;
	}
	const range = selection.getRangeAt(0);
	const elements = getSelectableElements(range);
	if (elements.length === 0) {
		captured = null;
		return;
	}
	const first = elements[0];
	const currentContext = elements
		.map((element) => element.dataset.currentContext || element.textContent?.trim() || "")
		.filter(Boolean)
		.join("\n")
		.slice(0, 2500);
	const previousContext = first.dataset.previousContext ?? "";
	const sourceKind = first.dataset.learningKind ?? "selection";
	const rect = range.getBoundingClientRect();
	const bubbleWidth = 112;
	const top = Math.max(12, rect.top - 48);
	const left = Math.min(Math.max(12, rect.left + rect.width / 2 - bubbleWidth / 2), window.innerWidth - bubbleWidth - 12);
	captured = {
		text,
		currentContext,
		previousContext,
		sourceKind,
		top,
		left,
		key: `${sourceKey}:${sourceKind}:${text}`,
	};
}

function clearStatusSoon() {
	if (statusTimeout) clearTimeout(statusTimeout);
	statusTimeout = setTimeout(() => (saveStatus = null), 2500);
}

function handleAsk() {
	if (!captured) return;
	onAskSelection(captured);
	dismissSelection();
}

async function handleSave() {
	if (!captured || isSaving || savedKeys.has(captured.key)) return;
	isSaving = true;
	const selection = captured;
	try {
		const result = await onSaveSelection(selection);
		savedKeys = new Set(savedKeys).add(selection.key);
		saveStatus = {
			message:
				result.count === 1
					? "Saved 1 note"
					: result.count > 1
						? `Saved ${result.count} notes`
						: `No note created - ${result.reason ?? "No note-worthy point found."}`,
			kind: result.count > 0 ? "success" : "empty",
			top: selection.top,
			left: selection.left,
		};
		dismissSelection();
	} catch (error) {
		saveStatus = {
			message: error instanceof Error ? error.message : "Failed to save notes",
			kind: "error",
			top: selection.top,
			left: selection.left,
		};
	} finally {
		isSaving = false;
		clearStatusSoon();
	}
}

onMount(() => {
	const handleSelectionChange = () => window.setTimeout(captureCurrentSelection, 0);
	const handlePointer = (event: PointerEvent) => {
		if (!(event.target as Element | null)?.closest("[data-selection-bubble]")) captured = null;
	};
	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === "Escape") dismissSelection();
	};
	document.addEventListener("selectionchange", handleSelectionChange);
	document.addEventListener("mouseup", handleSelectionChange);
	document.addEventListener("touchend", handleSelectionChange);
	document.addEventListener("pointerdown", handlePointer, true);
	document.addEventListener("scroll", dismissSelection, true);
	document.addEventListener("keydown", handleKeydown);
	return () => {
		document.removeEventListener("selectionchange", handleSelectionChange);
		document.removeEventListener("mouseup", handleSelectionChange);
		document.removeEventListener("touchend", handleSelectionChange);
		document.removeEventListener("pointerdown", handlePointer, true);
		document.removeEventListener("scroll", dismissSelection, true);
		document.removeEventListener("keydown", handleKeydown);
		if (statusTimeout) clearTimeout(statusTimeout);
	};
});
</script>

{#if captured}
	<div
		data-selection-bubble
		class="fixed z-[60] flex items-center gap-1 rounded-full border border-border bg-background/95 p-1 shadow-xl backdrop-blur-md"
		style="top: {captured.top}px; left: {captured.left}px;"
		transition:scale={{ duration: 120, start: 0.95 }}
	>
		<button
			type="button"
			class="rounded-full p-2 text-foreground hover:bg-muted disabled:opacity-40"
			onclick={handleAsk}
			disabled={isSaving}
			title="Ask about selection"
			aria-label="Ask about selection"
		>
			<MessageCircleQuestion size={16} />
		</button>
		<button
			type="button"
			class="rounded-full p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
			onclick={handleSave}
			disabled={isSaving || savedKeys.has(captured.key)}
			title="Save selection to notes"
			aria-label="Save selection to notes"
		>
			{#if isSaving}
				<LoaderCircle size={16} class="animate-spin" />
			{:else}
				<BookmarkPlus size={16} />
			{/if}
		</button>
	</div>
{/if}

{#if saveStatus}
	<div
		class="fixed z-[60] max-w-xs rounded-full border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md {saveStatus.kind === 'success' ? 'border-green-200 bg-green-50/95 text-green-700' : saveStatus.kind === 'empty' ? 'border-border bg-background/95 text-muted-foreground' : 'border-red-200 bg-red-50/95 text-red-700'}"
		style="top: {saveStatus.top}px; left: {saveStatus.left}px;"
		transition:fade={{ duration: 150 }}
	>
		{saveStatus.message}
	</div>
{/if}
