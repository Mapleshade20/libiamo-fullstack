<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Plus from "@lucide/svelte/icons/plus";
import Send from "@lucide/svelte/icons/send";
import Smile from "@lucide/svelte/icons/smile";
import { fade } from "svelte/transition";
import { deserialize } from "$app/forms";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import EmojiPicker from "../../EmojiPicker.svelte";
import ResizeableTextarea from "../../ResizeableTextarea.svelte";
import { extractEmojiFromPickerEvent } from "../../utils/emojiUtils";
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
let hints = $state<Array<{ text: string; translation: string }>>([]);
let hintError = $state<string | null>(null);
let isGettingHint = $state(false);
let hintAbortController: AbortController | null = null;

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

async function handleGetHint() {
	if (isGettingHint) {
		showHintMenu = true;
		return;
	}
	if (!sessionId || isCompleted || disabled) return;
	isGettingHint = true;
	showHintMenu = true;
	hints = [];
	hintError = null;
	hintAbortController = new AbortController();
	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		const res = await fetch(`?/hint`, {
			method: "POST",
			body: formData,
			signal: hintAbortController.signal,
		});
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			hints = (result.data as any).hints;
		} else if (result.type === "failure") {
			const error = (result.data as { error?: string } | undefined)?.error;
			hintError = error?.trim() || "Failed to generate hints";
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			console.log("Hint request was aborted by user.");
		} else {
			hintError = error instanceof Error && error.message.trim() ? error.message : "Failed to generate hints";
			console.error("Failed to get hints:", error);
		}
	} finally {
		isGettingHint = false;
		hintAbortController = null;
	}
}

function closeHintMenu() {
	showHintMenu = false;
	hintError = null;
	if (isGettingHint && hintAbortController) {
		hintAbortController.abort();
		isGettingHint = false;
		hintAbortController = null;
	}
}

function selectHint(text: string) {
	inputText = limitInputText(text);
	showHintMenu = false;
}

function submitInput() {
	if (!canSend) return;
	const text = limitInputText(inputText);
	inputText = "";
	showMentionMenu = false;
	showEmojiPicker = false;
	showHintMenu = false;
	onSend(text);
}

function handleWindowClick(e: MouseEvent) {
	const target = e.target as HTMLElement;
	if (!target.closest(".emoji-container-wrapper")) {
		showEmojiPicker = false;
	}
	if (!target.closest(".hint-container-wrapper")) {
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

	<div class="flex items-center gap-2">
		<div class="relative flex shrink-0 items-center hint-container-wrapper md:hidden">
			<button
				type="button"
				class="flex h-10 w-10 items-center justify-center rounded-xl border border-[#4E5058] bg-[#3F4147] text-[#DBDEE1] shadow-sm transition-all hover:border-[#5B5E66] hover:bg-[#4E5058] disabled:opacity-50 {isGettingHint ? 'text-yellow-400' : ''}"
				onclick={(e) => {
					e.stopPropagation();
					handleGetHint();
				}}
				title={t.getHint}
				{disabled}
			>
				<Lightbulb size={20} class={isGettingHint ? "animate-pulse" : ""} />
			</button>
			{#if showHintMenu}
				<div
					class="absolute bottom-full left-0 z-50 mb-3 flex w-72 flex-col overflow-hidden rounded-lg border border-[#1E1F22] bg-[#2B2D31] shadow-xl"
				>
					<div class="flex items-center justify-between border-b border-[#1E1F22] bg-[#232428] px-3 py-2 text-xs font-bold uppercase text-[#949BA4]">
						<span>{t.hintTitle}</span>
						<button
							type="button"
							onclick={(e) => {
								e.stopPropagation();
								closeHintMenu();
							}}
							class="text-lg hover:text-white"
						>
							&times;
						</button>
					</div>
					<div class="hide-scrollbar flex max-h-60 flex-col gap-1 overflow-y-auto p-2">
						{#if isGettingHint}
							<div class="animate-pulse py-6 text-center text-sm italic text-[#80848E]">{t.thinking}</div>
						{:else if hintError}
							<div class="py-6 text-center text-sm text-red-300">{hintError}</div>
						{:else}
							{#each hints as hint}
								<button
									type="button"
									class="w-full rounded border border-transparent p-2.5 text-left transition-colors hover:border-[#404249] hover:bg-[#35373C]"
									onclick={() => selectHint(hint.text)}
								>
									<div class="text-[13px] font-medium leading-snug text-[#DBDEE1]">{hint.text}</div>
								</button>
							{/each}
						{/if}
					</div>
				</div>
			{/if}
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
								handleGetHint();
							}}
							title={t.getHint}
							{disabled}
						>
							<Lightbulb size={22} class={isGettingHint ? "animate-pulse" : ""} />
						</button>
						{#if showHintMenu}
							<div
								class="absolute bottom-full right-0 z-50 mb-4 flex w-72 flex-col overflow-hidden rounded-lg border border-[#1E1F22] bg-[#2B2D31] shadow-xl"
							>
								<div
									class="flex items-center justify-between border-b border-[#1E1F22] bg-[#232428] px-3 py-2 text-xs font-bold uppercase text-[#949BA4]"
								>
									<span>{t.hintTitle}</span>
									<button
										type="button"
										onclick={(e) => {
											e.stopPropagation();
											closeHintMenu();
										}}
										class="text-lg hover:text-white"
									>
										&times;
									</button>
								</div>
								<div class="hide-scrollbar flex max-h-60 flex-col gap-1 overflow-y-auto p-2">
									{#if isGettingHint}
										<div class="animate-pulse py-6 text-center text-sm italic text-[#80848E]">{t.thinking}</div>
									{:else if hintError}
										<div class="py-6 text-center text-sm text-red-300">{hintError}</div>
									{:else}
										{#each hints as hint}
											<button
												type="button"
												class="w-full rounded border border-transparent p-2.5 text-left transition-colors hover:border-[#404249] hover:bg-[#35373C]"
												onclick={() => selectHint(hint.text)}
											>
												<div class="text-[13px] text-[#DBDEE1] font-medium leading-snug">{hint.text}</div>
											</button>
										{/each}
									{/if}
								</div>
							</div>
						{/if}
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
