<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Plus from "@lucide/svelte/icons/plus";
import Send from "@lucide/svelte/icons/send";
import Smile from "@lucide/svelte/icons/smile";
import { onDestroy } from "svelte";
import { fade } from "svelte/transition";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import EmojiPicker from "../../EmojiPicker.svelte";
import ResizeableTextarea from "../../ResizeableTextarea.svelte";
import { extractEmojiFromPickerEvent } from "../../utils/emojiUtils";
import { requestHint } from "../hint/api";
import HintFloatingPanel from "../hint/HintFloatingPanel.svelte";
import { createHintRequestLifecycle } from "../hint/requestLifecycle";
import type { ChatUser } from "./types";

let {
	inputText = $bindable(""),
	isSubmitting = false,
	isCompleting = false,
	isCompleted = false,
	isInitializing = false,
	limitReached = false,
	isWaitingRetry = false,
	messagePlaceholder = "",
	language = "en",
	sessionId = null as number | null,
	t = {} as Record<string, string>,
	allUsers = [] as ChatUser[],
	onSend = (_text: string) => {},
}: {
	inputText?: string;
	isSubmitting?: boolean;
	isCompleting?: boolean;
	isCompleted?: boolean;
	isInitializing?: boolean;
	limitReached?: boolean;
	isWaitingRetry?: boolean;
	messagePlaceholder?: string;
	language?: string;
	sessionId?: number | null;
	t?: Record<string, string>;
	allUsers?: ChatUser[];
	onSend?: (text: string) => void;
} = $props();
let showMentionMenu = $state(false);
let mentionQuery = $state("");
let mentionIndex = $state(0);
let filteredMentionUsers = $derived(allUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())));
let showEmojiPicker = $state(false);
let showHintMenu = $state(false);
let contentHint = $state("");
let expressionQuery = $state("");
let expressionPhrases = $state<string[]>([]);
let hintError = $state<string | null>(null);
let isGettingHint = $state(false);
const hintRequests = createHintRequestLifecycle();
let hintLayoutReference = $state<HTMLDivElement | null>(null);
let hintMotionOrigin = $state<HTMLElement | null>(null);

const disabled = $derived(isSubmitting || isCompleting || isCompleted || isInitializing || limitReached || isWaitingRetry);
const canSend = $derived(Boolean(inputText.trim()) && !disabled);

function limitInputText(value: string) {
	return value.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);
}

$effect(() => {
	const text = inputText;
	const match = text.match(/@([a-zA-Z0-9_]*)$/);
	if (match) {
		mentionQuery = match[1];
		showMentionMenu = true;
	} else {
		showMentionMenu = false;
	}
});

function handleEmojiSelected(event: CustomEvent | Event) {
	const emoji = extractEmojiFromPickerEvent(event);
	if (emoji) {
		inputText = limitInputText(inputText + emoji);
	}
	showEmojiPicker = false;
}

function insertMention(user: ChatUser) {
	const lastAtIndex = inputText.lastIndexOf("@");
	if (lastAtIndex !== -1) {
		const beforeMention = inputText.slice(0, lastAtIndex);
		inputText = limitInputText(`${beforeMention}@${user.name}`);
	} else {
		const space = inputText.endsWith(" ") || inputText === "" ? "" : " ";
		inputText = limitInputText(`${inputText}${space}@${user.name} `);
	}
	showMentionMenu = false;
}

function openHintMenu(trigger: HTMLElement) {
	if (!sessionId || isCompleted || disabled) return;
	hintMotionOrigin = trigger;
	showHintMenu = true;
	hintError = null;
	contentHint = "";
	expressionPhrases = [];
}

async function handleGetHint() {
	if (!sessionId || isCompleted || disabled) return;
	if (isGettingHint) return;
	const request = hintRequests.begin("content");
	isGettingHint = true;
	showHintMenu = true;
	contentHint = "";
	expressionPhrases = [];
	hintError = null;
	try {
		const result = await requestHint({ sessionId, mode: "content", draft: inputText });
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
		const result = await requestHint({ sessionId, mode: "expression", draft: inputText, expression: expressionQuery });
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

function closeHintMenu() {
	hintRequests.invalidate();
	showHintMenu = false;
	isGettingHint = false;
	hintError = null;
	contentHint = "";
	expressionQuery = "";
	expressionPhrases = [];
}

function submitInput() {
	if (!canSend) return;
	const text = limitInputText(inputText);
	inputText = "";
	showMentionMenu = false;
	showEmojiPicker = false;
	closeHintMenu();
	onSend(text);
}

onDestroy(() => hintRequests.invalidate());

function handleWindowClick(e: MouseEvent) {
	const target = e.target as HTMLElement;
	if (!target.closest(".emoji-container-wrapper")) {
		showEmojiPicker = false;
	}
	if (!target.closest(".hint-container-wrapper") && !target.closest(".hint-bubble")) {
		if (showHintMenu) {
			closeHintMenu();
		}
	}
}

function handleKeyDown(e: KeyboardEvent) {
	if (showMentionMenu && filteredMentionUsers.length > 0) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			mentionIndex = (mentionIndex + 1) % filteredMentionUsers.length;
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			mentionIndex = (mentionIndex - 1 + filteredMentionUsers.length) % filteredMentionUsers.length;
			return;
		}
		if (e.key === "Enter" || e.key === "Tab") {
			e.preventDefault();
			insertMention(filteredMentionUsers[mentionIndex]);
			return;
		}
		if (e.key === "Escape") {
			showMentionMenu = false;
			return;
		}
	}
	if (e.key === "Enter" && !e.shiftKey) {
		const isMobile = window.matchMedia("(max-width: 768px)").matches;
		if (!isMobile) {
			e.preventDefault();
			submitInput();
		}
	}
}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="relative shrink-0 px-3 pb-6 pt-1 md:px-4">
	{#if showMentionMenu && filteredMentionUsers.length > 0}
		<div class="absolute bottom-[100%] left-4 mb-2 w-72 bg-[#2B2D31] border border-[#1E1F22] rounded shadow-xl overflow-hidden z-50">
			<div class="px-3 py-2 text-xs font-bold text-[#949BA4] uppercase bg-[#232428]">Members</div>
			<ul class="max-h-60 overflow-y-auto hide-scrollbar py-1">
				{#each filteredMentionUsers as user, i}
					<li class="mx-1">
						<button
							type="button"
							class="w-full text-left px-3 py-2 rounded hover:bg-[#35373C] cursor-pointer flex items-center gap-2 {mentionIndex ===
							i
								? 'bg-[#35373C]'
								: ''}"
							onmouseenter={() => (mentionIndex = i)}
							onmousedown={(e) => {
								e.preventDefault();
								insertMention(user);
							}}
						>
							<div class="w-6 h-6 shrink-0 rounded-full {user.color} flex items-center justify-center text-xs font-bold text-white overflow-hidden">
								{user.name.charAt(0)}
							</div>
							<span class="text-[#DBDEE1] text-sm font-medium">{user.name}</span>
							{#if user.isAgent}
								<span class="ml-auto text-[10px] bg-[#5865F2] text-white px-1.5 rounded font-bold uppercase tracking-wide">Bot</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div bind:this={hintLayoutReference} class="flex items-center gap-2">
		<div class="relative flex shrink-0 items-center hint-container-wrapper md:hidden">
			<button
				type="button"
				class="flex h-10 w-10 items-center justify-center rounded-xl border border-[#4E5058] bg-[#3F4147] text-[#DBDEE1] shadow-sm transition-all hover:border-[#5B5E66] hover:bg-[#4E5058] disabled:opacity-50 {isGettingHint ? 'text-yellow-400' : ''}"
				onclick={(e) => {
					e.stopPropagation();
					if (showHintMenu) {
						closeHintMenu();
					} else {
						openHintMenu(e.currentTarget);
					}
				}}
				title={t.getHint}
				aria-label={t.getHint}
				{disabled}
			>
				<Lightbulb size={20} class={isGettingHint ? "animate-pulse" : ""} />
			</button>
		</div>

		<div class="relative min-w-0 flex-1 rounded-lg bg-[#383A40]">
			<div class="flex items-center px-2 md:px-4 {disabled ? 'opacity-50' : ''}">
				<div class="mr-4 hidden h-[44px] shrink-0 items-center justify-center md:flex">
					<button type="button" class="rounded-full bg-[#B5BAC1] p-1 text-[#383A40] transition-colors hover:bg-[#DBDEE1]" {disabled}>
						<Plus size={16} strokeWidth={3} />
					</button>
				</div>

				<div class="flex-1 min-w-0">
					<ResizeableTextarea
						bind:value={inputText}
						maxRows={10}
						maxLength={PRACTICE_UI_TEXT_MAX_LENGTH}
						{disabled}
						placeholder={isCompleted
							? "Session ended"
							: limitReached
								? "Turn limit reached"
								: isWaitingRetry
									? t.retryInputPlaceholder
									: messagePlaceholder}
						onKeyDown={handleKeyDown}
					/>
				</div>

				<div class="relative ml-2 flex shrink-0 items-center justify-center gap-3 text-[#B5BAC1] md:ml-3">
					<div class="relative hidden items-center hint-container-wrapper md:flex">
						<button
							type="button"
							class="transition-colors {isGettingHint ? 'text-yellow-400' : 'hover:text-[#DBDEE1]'}"
							onclick={(e) => {
								e.stopPropagation();
								if (showHintMenu) {
									closeHintMenu();
								} else {
									openHintMenu(e.currentTarget);
								}
							}}
							title={t.getHint}
							aria-label={t.getHint}
							{disabled}
						>
							<Lightbulb size={22} class={isGettingHint ? "animate-pulse" : ""} />
						</button>
					</div>

					<div class="relative flex items-center emoji-container-wrapper">
						<button
							type="button"
							class="transition-colors {showEmojiPicker ? 'text-white' : 'hover:text-[#DBDEE1]'}"
							onclick={(e) => {
								e.stopPropagation();
								if (disabled) return;
								showEmojiPicker = !showEmojiPicker;
							}}
							{disabled}
						>
							<Smile size={22} />
						</button>
						{#if showEmojiPicker}
							<div
								class="fixed inset-x-3 bottom-24 z-[1002] overflow-hidden rounded-lg border border-[#1E1F22] bg-[#232428] shadow-xl md:absolute md:inset-auto md:bottom-full md:right-0 md:mb-4 md:w-[360px]"
								transition:fade={{ duration: 100 }}
							>
								<div class="max-h-[300px] overflow-y-auto custom-scrollbar"><EmojiPicker onEmojiSelected={handleEmojiSelected} /></div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<button
			type="button"
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 md:hidden {canSend
				? 'bg-gradient-to-br from-[#5865F2] to-[#3B82F6] text-white shadow-lg shadow-[#5865F2]/25 active:scale-95'
				: 'bg-[#383A40] text-[#80848E]'}"
			style:color={canSend ? "#FFFFFF" : "#80848E"}
			onclick={submitInput}
			disabled={!canSend}
			aria-label="Send message"
		>
			<Send size={18} />
		</button>
	</div>
	{#if showHintMenu}
		<HintFloatingPanel
			anchorName="--libiamo-discord-hint-anchor"
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

<style>
.hide-scrollbar {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
</style>
