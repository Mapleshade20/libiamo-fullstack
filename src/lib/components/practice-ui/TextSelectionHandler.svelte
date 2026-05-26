<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import PlusCircle from "@lucide/svelte/icons/plus-circle";
import Save from "@lucide/svelte/icons/save";
import X from "@lucide/svelte/icons/x";
import { deserialize } from "$app/forms";

let {
	containerEl = null as HTMLElement | null,
	sessionId = null as number | null,
	t = {} as Record<string, string>,
}: {
	containerEl?: HTMLElement | null;
	sessionId?: number | null;
	t?: Record<string, string>;
} = $props();

// ── Selection state ───────────────────────────────────────────────
let selectedText = $state("");
let surroundingContext = $state("");
let toolbarPos = $state<{ x: number; y: number } | null>(null);

// ── Action state ──────────────────────────────────────────────────
let mode = $state<"idle" | "create" | "ask">("idle");
let loading = $state(false);
let resultText = $state<string | null>(null);
let isRejection = $state(false);

// ── Follow-up popover state ───────────────────────────────────────
let followUpQuestion = $state("");
let followUpAnswer = $state<string | null>(null);
let followUpLoading = $state(false);

function closeAll() {
	mode = "idle";
	loading = false;
	resultText = null;
	isRejection = false;
	followUpQuestion = "";
	followUpAnswer = null;
	followUpLoading = false;
	toolbarPos = null;
}

function handleMouseUp() {
	if (!containerEl) return;

	const sel = window.getSelection();
	if (!sel || sel.isCollapsed || !sel.toString().trim()) {
		closeAll();
		return;
	}

	const text = sel.toString().trim();
	if (text.length < 2) {
		closeAll();
		return;
	}

	// Check selection is within containerEl
	const range = sel.getRangeAt(0);
	if (!containerEl.contains(range.commonAncestorContainer)) {
		closeAll();
		return;
	}

	// Find the parent message bubble — walk up to nearest meaningful block
	let bubble: Node = range.commonAncestorContainer;
	while (bubble && bubble !== containerEl) {
		if (bubble.nodeType === Node.ELEMENT_NODE) {
			const el = bubble as HTMLElement;
			// Look for markdown-wrapper or a message block element
			if (el.classList.contains("markdown-wrapper") || el.closest("[data-message]")) {
				break;
			}
		}
		if (bubble.parentNode) bubble = bubble.parentNode;
		else break;
	}

	const ctx = (bubble as HTMLElement)?.textContent?.trim() ?? text;

	selectedText = text;
	surroundingContext = ctx;

	// Position toolbar near end of selection
	const endRect = range.getClientRects().item(range.getClientRects().length - 1);
	if (endRect) {
		toolbarPos = {
			x: endRect.right + 8,
			y: endRect.top - 4,
		};
	} else {
		toolbarPos = null;
	}

	mode = "idle";
	resultText = null;
	isRejection = false;
	followUpAnswer = null;
}

// ── Create note ────────────────────────────────────────────────────
async function handleCreateNote() {
	if (!sessionId || loading) return;
	loading = true;
	mode = "create";
	resultText = null;
	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("selectedText", selectedText);
		formData.append("surroundingContext", surroundingContext);
		const res = await fetch("?/createNoteFromSelection", { method: "POST", body: formData });
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			if ((result.data as { success?: boolean }).success) {
				resultText = t.noteCreated ?? "Note created!";
				isRejection = false;
			} else {
				resultText = (result.data as { reason?: string }).reason ?? t.selectionRejected ?? "Could not create note";
				isRejection = true;
			}
		}
	} catch (e) {
		console.error("Create note failed:", e);
		resultText = t.selectionRejected ?? "Could not create note";
		isRejection = true;
	} finally {
		loading = false;
	}
}

// ── Ask about this ─────────────────────────────────────────────────
function openAsk() {
	mode = "ask";
	followUpQuestion = "";
	followUpAnswer = null;
}

async function submitAsk(q: string) {
	if (!sessionId || followUpLoading) return;
	followUpLoading = true;
	followUpAnswer = null;
	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("selectedText", selectedText);
		formData.append("surroundingContext", surroundingContext);
		formData.append("question", q);
		const res = await fetch("?/followUpOnSelection", { method: "POST", body: formData });
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			followUpAnswer = (result.data as { answer?: string }).answer ?? null;
		}
	} catch (e) {
		console.error("Follow-up failed:", e);
	} finally {
		followUpLoading = false;
	}
}

async function handleSaveNote() {
	if (!sessionId || loading || !followUpAnswer) return;
	loading = true;
	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("selectedText", selectedText);
		formData.append("surroundingContext", surroundingContext);
		formData.append("question", followUpQuestion);
		formData.append("answer", followUpAnswer);
		const res = await fetch("?/saveNoteFromSelection", { method: "POST", body: formData });
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			resultText = t.noteCreated ?? "Note created!";
			isRejection = false;
			mode = "create";
		}
	} catch (e) {
		console.error("Save note failed:", e);
	} finally {
		loading = false;
	}
}

// ── Listeners ──────────────────────────────────────────────────────
$effect(() => {
	const el = containerEl;
	if (!el) return;

	function onMouseUp() {
		handleMouseUp();
	}
	function onClickOutside(e: MouseEvent) {
		// If click is outside our toolbar, close
		const target = e.target as HTMLElement;
		if (!target.closest(".text-selection-toolbar")) {
			closeAll();
		}
	}
	function onKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape") closeAll();
	}

	el.addEventListener("mouseup", onMouseUp);
	document.addEventListener("mousedown", onClickOutside);
	document.addEventListener("keydown", onKeyDown);

	return () => {
		el.removeEventListener("mouseup", onMouseUp);
		document.removeEventListener("mousedown", onClickOutside);
		document.removeEventListener("keydown", onKeyDown);
	};
});
</script>

{#if selectedText && toolbarPos}
	<div
		class="text-selection-toolbar fixed z-[9999] flex flex-col gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg"
		style="left: {toolbarPos.x}px; top: {toolbarPos.y}px;"
	>
		{#if mode === "create" && (resultText || loading)}
			<div class="flex items-center gap-2 px-2 py-1 text-xs max-w-64">
				{#if loading}
					<LoaderCircle size={14} class="animate-spin shrink-0" />
					<span class="text-muted-foreground">...</span>
				{:else if isRejection}
					<span class="text-red-500">{resultText}</span>
				{:else}
					<span class="text-green-500">{resultText}</span>
				{/if}
				<button type="button" class="ml-auto shrink-0 opacity-50 hover:opacity-100" onclick={closeAll}><X size={12} /></button>
			</div>
		{:else if mode === "ask"}
			{#if followUpAnswer}
				<div class="flex flex-col gap-1.5 max-w-72">
					<div class="flex items-start gap-2">
						<p class="flex-1 text-xs leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">{followUpAnswer}</p>
						<button type="button" class="shrink-0 opacity-50 hover:opacity-100" onclick={closeAll}><X size={12} /></button>
					</div>
					<button
						type="button"
						class="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium hover:bg-muted-foreground/15 disabled:opacity-40"
						disabled={loading}
						onclick={handleSaveNote}
					>
						{#if loading}
							<LoaderCircle size={12} class="animate-spin" />
						{:else}
							<Save size={12} />
						{/if}
						{t.saveAsNote ?? "Save as note"}
					</button>
				</div>
			{:else}
				<div class="flex flex-col gap-1.5">
					<div class="flex flex-wrap gap-1">
						<button type="button" class="rounded-full bg-muted px-2 py-0.5 text-[10px] hover:bg-muted-foreground/15" onclick={() => submitAsk("why")}>
							{t.askWhy ?? "Why is this wrong?"}
						</button>
						<button
							type="button"
							class="rounded-full bg-muted px-2 py-0.5 text-[10px] hover:bg-muted-foreground/15"
							onclick={() => submitAsk("examples")}
						>
							{t.askExamples ?? "Give me more examples"}
						</button>
					</div>
					<form
						class="flex gap-1"
						onsubmit={(e) => {
							e.preventDefault();
							const q = followUpQuestion.trim();
							if (q) submitAsk(q);
						}}
					>
						<input
							type="text"
							class="flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] placeholder:text-muted-foreground/40"
							placeholder={t.askPlaceholder ?? "Ask a follow-up question..."}
							bind:value={followUpQuestion}
							disabled={followUpLoading}
						>
						<button
							type="submit"
							class="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium hover:bg-muted-foreground/15 disabled:opacity-40"
							disabled={followUpLoading || !followUpQuestion.trim()}
						>
							{#if followUpLoading}
								<LoaderCircle size={11} class="animate-spin" />
							{:else}
								{t.askSubmit ?? "Ask"}
							{/if}
						</button>
					</form>
					<button
						type="button"
						class="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
						onclick={() => { mode = "idle"; }}
					>
						← Back
					</button>
				</div>
			{/if}
		{:else}
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors whitespace-nowrap"
				onclick={handleCreateNote}
			>
				<PlusCircle size={14} />
				{t.createNoteFromSelection ?? "Create note"}
			</button>
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors whitespace-nowrap"
				onclick={openAsk}
			>
				<MessageCircleQuestion size={14} />
				{t.askAboutSelection ?? "Ask about this"}
			</button>
		{/if}
	</div>
{/if}
