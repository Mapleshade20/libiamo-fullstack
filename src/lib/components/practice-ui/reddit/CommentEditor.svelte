<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Image from "@lucide/svelte/icons/image";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import { onMount } from "svelte";
import { deserialize } from "$app/forms";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/practice-limits";
import type { ContextComment } from "./types";

let {
	inputText = $bindable(""),
	disabled = false,
	placeholder = "What are your thoughts?",
	userName = "",
	avatarUrl = "",
	avatarColor = "bg-[#FF4500]",
	t = {} as Record<string, string>,
	onSubmit,
	sessionId = null as number | null,
	contextPath = [] as ContextComment[],
}: {
	inputText?: string;
	disabled?: boolean;
	placeholder?: string;
	userName?: string;
	avatarUrl?: string;
	avatarColor?: string;
	t?: Record<string, string>;
	onSubmit: (text: string) => void;
	sessionId?: number | null;
	contextPath?: ContextComment[];
} = $props();

let isExpanded = $state(false);
let textareaEl = $state<HTMLTextAreaElement | null>(null);

// ── Hint state ───────────────────────────────────────────────────────
let showHintMenu = $state(false);
let hints = $state<Array<{ text: string; translation?: string }>>([]);
let isGettingHint = $state(false);
let hintAbortController: AbortController | null = null;
let hintButtonEl = $state<HTMLButtonElement | null>(null);

async function handleGetHint() {
	if (!sessionId || disabled || isGettingHint) return;
	isGettingHint = true;
	showHintMenu = true;
	hints = [];
	hintAbortController = new AbortController();
	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		if (contextPath.length > 0) {
			formData.append("contextPath", JSON.stringify(contextPath));
		}
		const res = await fetch("?/hint", {
			method: "POST",
			body: formData,
			signal: hintAbortController.signal,
		});
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			hints = (
				(
					result.data as {
						hints?: Array<{
							text: string;
							translation?: string;
						}>;
					}
				).hints ?? []
			).filter((h) => Boolean(h.text));
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
	inputText = text.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);
	if (!isExpanded) isExpanded = true;
	showHintMenu = false;
}

// ── Expand / Collapse ────────────────────────────────────────────────

function expand() {
	if (disabled) return;
	isExpanded = true;
	setTimeout(() => textareaEl?.focus(), 0);
}

function collapse() {
	isExpanded = false;
	inputText = "";
	closeHintMenu();
}

// ── Submit ───────────────────────────────────────────────────────────

function submit() {
	if (!inputText.trim() || disabled) return;
	onSubmit(inputText.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH));
	inputText = "";
	isExpanded = false;
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

// Auto-expand when inputText is set externally (e.g. hint selection)
$effect(() => {
	if (inputText && !isExpanded) {
		isExpanded = true;
	}
});

onMount(() => () => {
	if (hintAbortController) hintAbortController.abort();
});
</script>

<svelte:window onclick={handleWindowClick} />

{#if !isExpanded}
	<!-- Collapsed: single-line placeholder -->
	<div
		class="mb-2 cursor-text rounded-md border border-[#EDEFF1] bg-white px-3 py-2.5 text-sm text-[#878A8C] transition-colors hover:border-[#898989] {disabled
            ? 'cursor-not-allowed opacity-50'
            : ''}"
		onclick={expand}
		role="button"
		tabindex={disabled ? -1 : 0}
		onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") expand();
        }}
	>
		<div class="flex items-center gap-2">
			{#if avatarUrl}
				<img src={avatarUrl} alt={userName} class="h-6 w-6 shrink-0 rounded-full object-cover">
			{:else}
				<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {avatarColor} text-[9px] font-bold text-white">
					{userName.charAt(0).toUpperCase()}
				</div>
			{/if}
			<span>{placeholder}</span>
		</div>
	</div>
{:else}
	<!-- Expanded: full editor -->
	<!-- Note: NO overflow-hidden on editor box — it would clip the hint popup -->
	<div class="relative mb-2">
		<!-- Editor box -->
		<div class="rounded-md border border-[#0079D3] bg-white">
			<!-- Textarea -->
			<textarea
				bind:this={textareaEl}
				bind:value={inputText}
				maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
				rows="4"
				class="block min-h-[96px] w-full resize-none bg-white px-3 py-2.5 text-sm leading-6 text-[#1C1C1C] outline-none placeholder:text-[#878A8C] disabled:cursor-not-allowed disabled:bg-[#F6F7F8]"
				{placeholder}
				onkeydown={handleKeydown}
				{disabled}
			></textarea>

			<!-- Footer: toolbar + buttons -->
			<div class="flex items-center gap-1 border-t border-[#EDEFF1] bg-[#F6F7F8] px-2 py-1.5">
				<button type="button" class="rounded p-1 text-[#878A8C] hover:bg-[#EDEFF1] disabled:opacity-40" {disabled} tabindex="-1" aria-hidden="true">
					<Image size={16} />
				</button>
				<button
					type="button"
					class="rounded px-1.5 py-0.5 text-xs font-bold text-[#878A8C] hover:bg-[#EDEFF1] disabled:opacity-40"
					{disabled}
					tabindex="-1"
					aria-hidden="true"
				>
					GIF
				</button>
				<button
					type="button"
					class="rounded px-1.5 py-0.5 text-sm font-bold text-[#878A8C] hover:bg-[#EDEFF1] disabled:opacity-40"
					{disabled}
					tabindex="-1"
					aria-hidden="true"
				>
					Aa
				</button>
				<div class="flex-1"></div>
				{#if sessionId}
					<!-- Hint button with absolute-positioned popup above it -->
					<div class="hint-btn-wrapper relative">
						{#if showHintMenu}
							<div
								class="hint-popup absolute bottom-full right-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border border-[#EDEFF1] bg-white shadow-xl"
							>
								<div class="flex items-center justify-between border-b border-[#EDEFF1] px-3 py-2">
									<span class="text-xs font-bold uppercase tracking-wide text-[#878A8C]">{t.hintTitle}</span>
									<button
										type="button"
										class="text-sm text-[#878A8C] hover:text-[#1C1C1C]"
										onclick={(e) => {
                                            e.stopPropagation();
                                            closeHintMenu();
                                        }}
									>
										&times;
									</button>
								</div>
								<div class="max-h-56 space-y-1 overflow-y-auto p-2">
									{#if isGettingHint}
										<p class="py-5 text-center text-sm italic text-[#878A8C]">{t.thinking}</p>
									{:else if hints.length === 0}
										<p class="py-5 text-center text-sm text-[#878A8C]">{t.noHints}</p>
									{:else}
										{#each hints as hint}
											<button
												type="button"
												class="w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-[#EDEFF1] hover:bg-[#F6F7F8]"
												onclick={() =>
                                                    selectHint(hint.text)}
											>
												<p class="text-sm text-[#1C1C1C]">{hint.text}</p>
											</button>
										{/each}
									{/if}
								</div>
							</div>
						{/if}
						<button
							bind:this={hintButtonEl}
							type="button"
							class="flex h-6 w-6 items-center justify-center rounded text-[#878A8C] transition-colors hover:text-[#FF4500] disabled:opacity-40"
							title={t.getHint}
							onclick={(e) => {
                                e.stopPropagation();
                                if (showHintMenu) {
                                    closeHintMenu();
                                } else {
                                    handleGetHint();
                                }
                            }}
							{disabled}
						>
							<Lightbulb
								size={14}
								class={isGettingHint
                                    ? "animate-pulse text-[#FF4500]"
                                    : ""}
							/>
						</button>
					</div>
				{/if}
				<button
					type="button"
					class="rounded-full border border-[#0079D3] px-3 py-1 text-xs font-bold text-[#0079D3] transition-colors hover:bg-[#E8F0FD] disabled:opacity-40"
					onclick={collapse}
					{disabled}
				>
					{t.cancelReply ?? "Cancel"}
				</button>
				<button
					type="button"
					class="flex items-center gap-1 rounded-full bg-[#FF4500] px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-[#CC3700] disabled:bg-[#D1D1D6]"
					onclick={submit}
					disabled={!inputText.trim() || disabled}
				>
					<ArrowUp size={12} />
					{t.sendMessage ?? "Comment"}
				</button>
			</div>
		</div>
	</div>
{/if}
