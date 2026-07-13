<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Image from "@lucide/svelte/icons/image";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import { onDestroy } from "svelte";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { requestHint } from "../hint/api";
import HintFloatingPanel from "../hint/HintFloatingPanel.svelte";
import { createHintRequestLifecycle } from "../hint/requestLifecycle";
import type { ContextComment } from "./types";

let {
	inputText = $bindable(""),
	disabled = false,
	placeholder = "What are your thoughts?",
	userName = "",
	avatarUrl = "",
	avatarColor = "bg-[#FF4500]",
	t = {} as Record<string, string>,
	language = "en",
	hintEditorId = "comment-editor",
	activeHintEditorId = null as string | null,
	onHintActivate = (_editorId: string) => {},
	onHintDeactivate = (_editorId: string) => {},
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
	language?: string;
	hintEditorId?: string;
	activeHintEditorId?: string | null;
	onHintActivate?: (editorId: string) => void;
	onHintDeactivate?: (editorId: string) => void;
	onSubmit: (text: string) => void;
	sessionId?: number | null;
	contextPath?: ContextComment[];
} = $props();

let isExpanded = $state(false);
let textareaEl = $state<HTMLTextAreaElement | null>(null);
let hintLayoutReference = $state<HTMLDivElement | null>(null);
let hintMotionOrigin = $state<HTMLElement | null>(null);

// ── Hint state ───────────────────────────────────────────────────────
let showHintMenu = $state(false);
let contentHint = $state("");
let expressionQuery = $state("");
let expressionPhrases = $state<string[]>([]);
let hintError = $state<string | null>(null);
let isGettingHint = $state(false);
const hintRequests = createHintRequestLifecycle();
const hintAnchorName = $derived(`--libiamo-reddit-hint-${hintEditorId.replace(/[^a-zA-Z0-9_-]/g, "-")}`);

function openHintMenu(trigger: HTMLElement) {
	if (disabled) return;
	onHintActivate(hintEditorId);
	hintMotionOrigin = trigger;
	showHintMenu = true;
	hintError = null;
	contentHint = "";
	expressionPhrases = [];
}

async function handleGetHint() {
	if (disabled || isGettingHint) return;
	if (!sessionId) return;
	const request = hintRequests.begin("content");
	isGettingHint = true;
	showHintMenu = true;
	contentHint = "";
	expressionPhrases = [];
	hintError = null;
	try {
		const result = await requestHint({ sessionId, mode: "content", draft: inputText, contextPath });
		if (!hintRequests.isCurrent(request) || !showHintMenu) return;
		contentHint = result.contentHint ?? "";
	} catch (err) {
		if (!hintRequests.isCurrent(request) || !showHintMenu) return;
		hintError = err instanceof Error && err.message.trim() ? err.message : "Failed to generate hints";
		console.error("Failed to get hints:", err);
	} finally {
		if (hintRequests.isCurrent(request)) isGettingHint = false;
		hintRequests.finish(request);
	}
}

async function handleExpressionHelp() {
	if (disabled || isGettingHint || !expressionQuery.trim()) return;
	const request = hintRequests.begin("expression");
	isGettingHint = true;
	showHintMenu = true;
	contentHint = "";
	expressionPhrases = [];
	hintError = null;
	try {
		if (!sessionId) return;
		const result = await requestHint({ sessionId, mode: "expression", draft: inputText, expression: expressionQuery, contextPath });
		if (!hintRequests.isCurrent(request) || !showHintMenu) return;
		expressionPhrases = result.phrases ?? [];
	} catch (err) {
		if (!hintRequests.isCurrent(request) || !showHintMenu) return;
		hintError = err instanceof Error && err.message.trim() ? err.message : "Failed to generate hints";
		console.error("Failed to get expression help:", err);
	} finally {
		if (hintRequests.isCurrent(request)) isGettingHint = false;
		hintRequests.finish(request);
	}
}

function closeHintMenu(notifyParent = true) {
	hintRequests.invalidate();
	showHintMenu = false;
	isGettingHint = false;
	hintError = null;
	contentHint = "";
	expressionQuery = "";
	expressionPhrases = [];
	if (notifyParent) onHintDeactivate(hintEditorId);
}

onDestroy(() => {
	hintRequests.invalidate();
	onHintDeactivate(hintEditorId);
});

$effect(() => {
	if (showHintMenu && activeHintEditorId !== null && activeHintEditorId !== hintEditorId) closeHintMenu(false);
});

function handleWindowClick(event: MouseEvent) {
	const target = event.target as HTMLElement;
	if (!target.closest(".hint-btn-wrapper") && !target.closest(".hint-bubble")) {
		if (showHintMenu) closeHintMenu();
	}
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
	closeHintMenu();
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
	<div class="relative mb-2">
		<!-- Editor box -->
		<div bind:this={hintLayoutReference} class="rounded-md border border-[#0079D3] bg-white">
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
					<div class="hint-btn-wrapper relative">
						<button
							type="button"
							class="grid h-7 w-7 place-items-center rounded text-[#878A8C] transition-colors hover:bg-[#EDEFF1] hover:text-[#FF4500] disabled:opacity-40 {showHintMenu
								? 'bg-[#FFF3EC] text-[#FF4500]'
								: ''}"
							title={t.getHint}
							aria-label={t.getHint}
							onclick={(e) => {
								e.stopPropagation();
								if (showHintMenu) {
									closeHintMenu();
								} else {
									openHintMenu(e.currentTarget);
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
		{#if sessionId && showHintMenu}
			<HintFloatingPanel
				anchorName={hintAnchorName}
				layoutReference={hintLayoutReference}
				motionOrigin={hintMotionOrigin}
				{language}
				bind:expressionQuery
				{expressionPhrases}
				{contentHint}
				{hintError}
				{isGettingHint}
				{disabled}
				onExpressionSubmit={handleExpressionHelp}
				onContentHint={handleGetHint}
				onClose={closeHintMenu}
			/>
		{/if}
	</div>
{/if}
