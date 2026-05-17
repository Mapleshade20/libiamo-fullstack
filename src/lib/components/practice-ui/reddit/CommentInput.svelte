<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Bold from "@lucide/svelte/icons/bold";
import Code from "@lucide/svelte/icons/code";
import Italic from "@lucide/svelte/icons/italic";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Link from "@lucide/svelte/icons/link";
import List from "@lucide/svelte/icons/list";
import { onMount } from "svelte";
import { deserialize } from "$app/forms";

let {
	inputText = $bindable(""),
	isCompleted = false,
	limitReached = false,
	isWaitingRetry = false,
	disabled = false,
	sessionId = null as number | null,
	userName = "",
	avatarUrl = "",
	avatarColor = "bg-[#FF4500]",
	t = {} as Record<string, string>,
	onSend,
}: {
	inputText?: string;
	isCompleted?: boolean;
	limitReached?: boolean;
	isWaitingRetry?: boolean;
	disabled?: boolean;
	sessionId?: number | null;
	userName?: string;
	avatarUrl?: string;
	avatarColor?: string;
	t?: Record<string, string>;
	onSend: (text: string) => void;
} = $props();

// ── Hint state ───────────────────────────────────────────────────────
let showHintMenu = $state(false);
let hints = $state<Array<{ text: string; translation?: string }>>([]);
let isGettingHint = $state(false);
let hintAbortController: AbortController | null = null;
let hintButtonEl: HTMLButtonElement | null = null;
let hintPopupTop = $state(0);
let hintPopupLeft = $state(0);

function computeHintPopupPos() {
	if (!hintButtonEl) return;
	const rect = hintButtonEl.getBoundingClientRect();
	hintPopupTop = rect.top;
	hintPopupLeft = rect.right + 8;
}

async function handleGetHint() {
	if (!sessionId || disabled || isGettingHint) return;
	computeHintPopupPos();
	isGettingHint = true;
	showHintMenu = true;
	hints = [];
	hintAbortController = new AbortController();
	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		const res = await fetch("?/hint", { method: "POST", body: formData, signal: hintAbortController.signal });
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			hints = ((result.data as { hints?: Array<{ text: string; translation?: string }> }).hints ?? []).filter((h) => Boolean(h.text));
		}
	} catch (err) {
		if (!(err instanceof DOMException && err.name === "AbortError")) console.error("Failed to get hints:", err);
	} finally {
		isGettingHint = false;
		hintAbortController = null;
	}
}

function closeHintMenu() {
	showHintMenu = false;
	if (isGettingHint && hintAbortController) hintAbortController.abort();
	isGettingHint = false;
	hintAbortController = null;
}

function handleWindowClick(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".hint-btn-wrapper") && !target.closest(".hint-popup")) {
		if (showHintMenu) closeHintMenu();
	}
}

function selectHint(text: string) {
	inputText = text;
	showHintMenu = false;
}

// ── Submit ───────────────────────────────────────────────────────────
function submit() {
	if (!inputText.trim() || disabled) return;
	const text = inputText;
	inputText = "";
	onSend(text);
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Enter" && !e.shiftKey) {
		const isMobile = window.matchMedia("(max-width: 768px)").matches;
		if (!isMobile) {
			e.preventDefault();
			submit();
		}
	}
}

const placeholder = $derived(
	isCompleted ? t.sessionEnded : limitReached ? t.turnLimitReached : isWaitingRetry ? t.retryInputPlaceholder : t.joinConversation,
);

onMount(() => () => {
	if (hintAbortController) hintAbortController.abort();
});
</script>

<svelte:window onclick={handleWindowClick} />

<!-- Header row: avatar + username -->
<div class="mb-2 flex items-center gap-2 text-xs text-[#878A8C]">
	{#if avatarUrl}
		<img src={avatarUrl} alt={userName} class="h-6 w-6 shrink-0 rounded-full object-cover">
	{:else}
		<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {avatarColor} text-[9px] font-bold text-white">
			{userName.charAt(0).toUpperCase()}
		</div>
	{/if}
	<span class="font-semibold text-[#1C1C1C]">{userName}</span>
</div>

<!-- Editor wrapper: relative so the hint popup can escape the overflow-hidden box -->
<div class="relative">
	<!-- Hint popup: fixed so it escapes all overflow-hidden ancestors -->
	{#if showHintMenu}
		<div
			class="hint-popup fixed z-[9999] w-72 overflow-hidden rounded-xl border border-[#EDEFF1] bg-white shadow-xl"
			style="top: {hintPopupTop}px; left: {hintPopupLeft}px;"
		>
			<div class="flex items-center justify-between border-b border-[#EDEFF1] px-3 py-2">
				<span class="text-xs font-bold tracking-wide text-[#878A8C] uppercase">{t.hintTitle}</span>
				<button type="button" class="text-sm text-[#878A8C] hover:text-[#1C1C1C]" onclick={(e) => { e.stopPropagation(); closeHintMenu(); }}>
					&times;
				</button>
			</div>
			<div class="max-h-56 space-y-1 overflow-y-auto p-2">
				{#if isGettingHint}
					<p class="py-5 text-center text-sm text-[#878A8C] italic">{t.thinking}</p>
				{:else if hints.length === 0}
					<p class="py-5 text-center text-sm text-[#878A8C]">{t.noHints}</p>
				{:else}
					{#each hints as hint}
						<button
							type="button"
							class="w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-[#EDEFF1] hover:bg-[#F6F7F8]"
							onclick={() => selectHint(hint.text)}
						>
							<p class="text-sm text-[#1C1C1C]">{hint.text}</p>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<!-- Editor box -->
	<div class="overflow-hidden rounded-md border border-[#EDEFF1] bg-white focus-within:border-[#0079D3]">
		<!-- Markdown toolbar -->
		<div class="flex items-center gap-0.5 border-b border-[#EDEFF1] bg-[#F6F7F8] px-2 py-1">
			<button
				type="button"
				class="rounded p-1 text-[#878A8C] hover:bg-[#EDEFF1] hover:text-[#1C1C1C] disabled:opacity-40"
				{disabled}
				tabindex="-1"
				aria-hidden="true"
			>
				<Bold size={13} />
			</button>
			<button
				type="button"
				class="rounded p-1 text-[#878A8C] hover:bg-[#EDEFF1] hover:text-[#1C1C1C] disabled:opacity-40"
				{disabled}
				tabindex="-1"
				aria-hidden="true"
			>
				<Italic size={13} />
			</button>
			<button
				type="button"
				class="rounded p-1 text-[#878A8C] hover:bg-[#EDEFF1] hover:text-[#1C1C1C] disabled:opacity-40"
				{disabled}
				tabindex="-1"
				aria-hidden="true"
			>
				<Link size={13} />
			</button>
			<button
				type="button"
				class="rounded p-1 text-[#878A8C] hover:bg-[#EDEFF1] hover:text-[#1C1C1C] disabled:opacity-40"
				{disabled}
				tabindex="-1"
				aria-hidden="true"
			>
				<Code size={13} />
			</button>
			<button
				type="button"
				class="rounded p-1 text-[#878A8C] hover:bg-[#EDEFF1] hover:text-[#1C1C1C] disabled:opacity-40"
				{disabled}
				tabindex="-1"
				aria-hidden="true"
			>
				<List size={13} />
			</button>
			<div class="flex-1"></div>
			<!-- Hint button (no popup here — popup is above the editor box) -->
			<div class="hint-btn-wrapper">
				<button
					bind:this={hintButtonEl}
					type="button"
					class="flex h-6 w-6 items-center justify-center rounded text-[#878A8C] transition-colors hover:text-[#FF4500] disabled:opacity-40"
					title={t.getHint}
					onclick={(e) => { e.stopPropagation(); if (showHintMenu) { closeHintMenu(); } else { computeHintPopupPos(); handleGetHint(); } }}
					{disabled}
				>
					<Lightbulb size={14} class={isGettingHint ? "animate-pulse text-[#FF4500]" : ""} />
				</button>
			</div>
		</div>

		<!-- Textarea -->
		<textarea
			bind:value={inputText}
			rows="3"
			class="block min-h-[72px] max-h-48 w-full resize-none bg-white px-3 py-2.5 text-sm leading-6 text-[#1C1C1C] outline-none placeholder:text-[#878A8C] disabled:bg-[#F6F7F8] disabled:cursor-not-allowed"
			{placeholder}
			onkeydown={handleKeydown}
			{disabled}
		></textarea>

		<!-- Footer: cancel + submit -->
		<div class="flex items-center justify-end gap-2 border-t border-[#EDEFF1] bg-[#F6F7F8] px-3 py-2">
			<button
				type="button"
				class="rounded-full border border-[#0079D3] px-4 py-1.5 text-xs font-bold text-[#0079D3] transition-colors hover:bg-[#E8F0FD] disabled:opacity-40"
				onclick={() => { inputText = ""; }}
				{disabled}
			>
				Cancel
			</button>
			<button
				type="button"
				class="flex items-center gap-1.5 rounded-full bg-[#FF4500] px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#CC3700] disabled:bg-[#D1D1D6]"
				onclick={submit}
				disabled={!inputText.trim() || disabled}
			>
				<ArrowUp size={13} />
				{t.sendMessage}
			</button>
		</div>
	</div>
</div>
