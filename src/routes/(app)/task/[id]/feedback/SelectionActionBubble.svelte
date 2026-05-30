<script lang="ts">
import BookmarkPlus from "@lucide/svelte/icons/bookmark-plus";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import { onMount } from "svelte";
import { fade, scale } from "svelte/transition";
import { deserialize } from "$app/forms";

type CapturedSelection = {
	text: string;
	top: number;
	left: number;
	currentContext: string;
	previousContext: string;
	sourceKind: string;
	sourceMessageId: number | null;
	key: string;
};

type SaveStatus = {
	message: string;
	kind: "success" | "empty" | "error";
	top: number;
	left: number;
};

let {
	sessionId,
	language,
	onAskSelection,
}: {
	sessionId: number;
	language: string;
	onAskSelection: (text: string) => void;
} = $props();

let captured = $state<CapturedSelection | null>(null);
let saveStatus = $state<SaveStatus | null>(null);
let isSaving = $state(false);
let savedKeys = $state(new Set<string>());
let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function clearStatusSoon() {
	if (statusTimeout) clearTimeout(statusTimeout);
	statusTimeout = setTimeout(() => {
		saveStatus = null;
	}, 2500);
}

function getElementFromNode(node: Node | null): Element | null {
	if (!node) return null;
	return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

function isInsideIgnoredUi(selection: Selection): boolean {
	const anchorElement = getElementFromNode(selection.anchorNode);
	const focusElement = getElementFromNode(selection.focusNode);
	return Boolean(anchorElement?.closest("[data-selection-ignore]") || focusElement?.closest("[data-selection-ignore]"));
}

function getSelectableElements(range: Range): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>("[data-feedback-selectable]")).filter((element) => {
		try {
			return range.intersectsNode(element);
		} catch {
			return false;
		}
	});
}

function clampPosition(rect: DOMRect) {
	const bubbleWidth = 112;
	const top = Math.max(12, rect.top - 48);
	const left = Math.min(Math.max(12, rect.left + rect.width / 2 - bubbleWidth / 2), window.innerWidth - bubbleWidth - 12);
	return { top, left };
}

function captureCurrentSelection() {
	if (isSaving) return;

	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		captured = null;
		return;
	}

	const text = selection.toString().trim();
	if (text.length < 2 || isInsideIgnoredUi(selection)) {
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
	const sourceKind = first.dataset.feedbackKind ?? "selection";
	const sourceMessageId = first.dataset.messageId ? Number.parseInt(first.dataset.messageId, 10) : null;
	const rect = range.getBoundingClientRect();
	const position = clampPosition(rect);
	const key = `${sessionId}:${sourceKind}:${sourceMessageId ?? "none"}:${text}`;

	captured = {
		text,
		...position,
		currentContext,
		previousContext,
		sourceKind,
		sourceMessageId: Number.isNaN(sourceMessageId) ? null : sourceMessageId,
		key,
	};
}

function handleSelectionChange() {
	window.setTimeout(captureCurrentSelection, 0);
}

function handleOutsidePointer(event: PointerEvent) {
	const target = event.target as Element | null;
	if (!target?.closest("[data-selection-bubble]")) {
		captured = null;
	}
}

function handleEscape(event: KeyboardEvent) {
	if (event.key === "Escape") dismissSelection();
}

function dismissSelection() {
	captured = null;
	window.getSelection()?.removeAllRanges();
}

function handleAsk() {
	if (!captured) return;
	onAskSelection(captured.text);
	dismissSelection();
}

async function handleSave() {
	if (!captured || isSaving || savedKeys.has(captured.key)) return;

	isSaving = true;
	const selection = captured;

	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("selectedText", selection.text);
		formData.append("currentContext", selection.currentContext);
		formData.append("previousContext", selection.previousContext);
		formData.append("sourceKind", selection.sourceKind);
		formData.append("language", language);
		if (selection.sourceMessageId !== null) formData.append("sourceMessageId", String(selection.sourceMessageId));

		const response = await fetch("?/saveSelectionNotes", {
			method: "POST",
			body: formData,
		});

		const result = deserialize(await response.text());
		if (result.type === "success") {
			const count = (result.data?.count as number | undefined) ?? 0;
			const reason = (result.data?.reason as string | undefined) ?? "No note-worthy point found.";
			savedKeys = new Set(savedKeys).add(selection.key);
			saveStatus = {
				message: count === 1 ? "Saved 1 note" : count > 1 ? `Saved ${count} notes` : `No note created — ${reason}`,
				kind: count > 0 ? "success" : "empty",
				top: selection.top,
				left: selection.left,
			};
			dismissSelection();
			clearStatusSoon();
		} else {
			const error = (result.type === "failure" ? (result.data?.error as string | undefined) : undefined) ?? "Failed to save notes";
			saveStatus = { message: error, kind: "error", top: selection.top, left: selection.left };
			clearStatusSoon();
		}
	} catch (e) {
		console.error("Failed to save selected notes:", e);
		saveStatus = { message: "Network error", kind: "error", top: selection.top, left: selection.left };
		clearStatusSoon();
	} finally {
		isSaving = false;
	}
}

onMount(() => {
	document.addEventListener("selectionchange", handleSelectionChange);
	document.addEventListener("mouseup", handleSelectionChange);
	document.addEventListener("keyup", handleSelectionChange);
	document.addEventListener("touchend", handleSelectionChange);
	document.addEventListener("pointerdown", handleOutsidePointer, true);
	document.addEventListener("scroll", dismissSelection, true);
	document.addEventListener("keydown", handleEscape);

	return () => {
		document.removeEventListener("selectionchange", handleSelectionChange);
		document.removeEventListener("mouseup", handleSelectionChange);
		document.removeEventListener("keyup", handleSelectionChange);
		document.removeEventListener("touchend", handleSelectionChange);
		document.removeEventListener("pointerdown", handleOutsidePointer, true);
		document.removeEventListener("scroll", dismissSelection, true);
		document.removeEventListener("keydown", handleEscape);
		if (statusTimeout) clearTimeout(statusTimeout);
	};
});
</script>

{#if captured}
	<div
		data-selection-bubble
		class="fixed z-[60] flex items-center gap-1 rounded-full border border-[#d8d0c5] bg-white/95 p-1 shadow-xl backdrop-blur-md"
		style="top: {captured.top}px; left: {captured.left}px;"
		transition:scale={{ duration: 120, start: 0.95 }}
	>
		<button
			type="button"
			class="rounded-full p-2 text-[#4a7c59] transition-colors hover:bg-[#4a7c59]/10 disabled:opacity-40"
			onclick={handleAsk}
			disabled={isSaving}
			title="Ask about selection"
			aria-label="Ask about selection"
		>
			<MessageCircleQuestion size={16} />
		</button>
		<button
			type="button"
			class="rounded-full p-2 text-[#6b6560] transition-colors hover:bg-[#6b6560]/10 disabled:opacity-40"
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
		class="fixed z-[60] max-w-xs rounded-full border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md {saveStatus.kind === 'success' ? 'border-green-200 bg-green-50/95 text-green-700' : saveStatus.kind === 'empty' ? 'border-[#e8e3db] bg-white/95 text-[#6b6560]' : 'border-red-200 bg-red-50/95 text-red-700'}"
		style="top: {saveStatus.top}px; left: {saveStatus.left}px;"
		transition:fade={{ duration: 150 }}
	>
		{saveStatus.message}
	</div>
{/if}
