<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Plus from "@lucide/svelte/icons/plus";
import Smile from "@lucide/svelte/icons/smile";
import { fade } from "svelte/transition";
import { deserialize } from "$app/forms";
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
let isGettingHint = $state(false);
let hintAbortController: AbortController | null = null;

const disabled = $derived(isSubmitting || isCompleting || isCompleted || isInitializing || limitReached);

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
		inputText += emoji;
	}
	showEmojiPicker = false;
}

function insertMention(user: ChatUser) {
	const lastAtIndex = inputText.lastIndexOf("@");
	if (lastAtIndex !== -1) {
		const beforeMention = inputText.slice(0, lastAtIndex);
		inputText = `${beforeMention}@${user.name}`;
	} else {
		const space = inputText.endsWith(" ") || inputText === "" ? "" : " ";
		inputText += `${space}@${user.name} `;
	}
	showMentionMenu = false;
}

async function handleGetHint() {
	if (isGettingHint) {
		showHintMenu = true;
		return;
	}
	if (!sessionId || isCompleted) return;
	isGettingHint = true;
	showHintMenu = true;
	hints = [];
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
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			console.log("Hint request was aborted by user.");
		} else {
			console.error("Failed to get hints:", error);
		}
	} finally {
		isGettingHint = false;
		hintAbortController = null;
	}
}

function closeHintMenu() {
	showHintMenu = false;
	if (isGettingHint && hintAbortController) {
		hintAbortController.abort();
		isGettingHint = false;
		hintAbortController = null;
	}
}

function selectHint(text: string) {
	inputText = text;
	showHintMenu = false;
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
			if (!inputText.trim() || disabled) return;
			const text = inputText;
			inputText = "";
			showMentionMenu = false;
			showEmojiPicker = false;
			onSend(text);
		}
	}
}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="px-4 pb-6 pt-1 shrink-0 relative">
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

	<div class="flex flex-col relative rounded-lg bg-[#383A40]">
		<div class="flex items-start px-4 {disabled ? 'opacity-50' : ''}">
			<div class="flex h-[44px] shrink-0 items-center justify-center mr-4">
				<button type="button" class="rounded-full bg-[#B5BAC1] p-1 text-[#383A40] transition-colors hover:bg-[#DBDEE1]" {disabled}>
					<Plus size={16} strokeWidth={3} />
				</button>
			</div>

			<div class="flex-1 min-w-0">
				<ResizeableTextarea
					bind:value={inputText}
					maxRows={10}
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

			<div class="flex h-[44px] shrink-0 items-center justify-center gap-3 ml-3 text-[#B5BAC1] relative">
				<div class="relative flex h-full items-center hint-container-wrapper">
					<button
						type="button"
						class="transition-colors {isGettingHint ? 'text-yellow-400' : 'hover:text-[#DBDEE1]'}"
						onclick={(e) => {
							e.stopPropagation();
							handleGetHint();
						}}
						title={t.getHint}
					>
						<Lightbulb size={22} class={isGettingHint ? "animate-pulse" : ""} />
					</button>
					{#if showHintMenu}
						<div
							class="absolute bottom-[100%] right-0 mb-4 w-72 bg-[#2B2D31] border border-[#1E1F22] rounded-lg shadow-xl overflow-hidden z-50 flex flex-col"
						>
							<div
								class="px-3 py-2 text-xs font-bold text-[#949BA4] uppercase bg-[#232428] border-b border-[#1E1F22] flex justify-between items-center"
							>
								<span>{t.hintTitle}</span>
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										closeHintMenu();
									}}
									class="hover:text-white text-lg"
								>
									&times;
								</button>
							</div>
							<div class="p-2 flex flex-col gap-1 max-h-60 overflow-y-auto hide-scrollbar">
								{#if isGettingHint}
									<div class="py-6 text-center text-sm text-[#80848E] italic animate-pulse">{t.thinking}</div>
								{:else}
									{#each hints as hint}
										<button
											type="button"
											class="w-full text-left p-2.5 rounded hover:bg-[#35373C] transition-colors border border-transparent hover:border-[#404249]"
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

				<div class="relative flex h-full items-center emoji-container-wrapper">
					<button
						type="button"
						class="transition-colors {showEmojiPicker ? 'text-white' : 'hover:text-[#DBDEE1]'}"
						onclick={(e) => {
							e.stopPropagation();
							showEmojiPicker = !showEmojiPicker;
						}}
					>
						<Smile size={22} />
					</button>
					{#if showEmojiPicker}
						<div
							class="absolute bottom-[100%] right-0 mb-4 z-[1002] bg-[#232428] border border-[#1E1F22] rounded-lg shadow-xl overflow-hidden"
							transition:fade={{ duration: 100 }}
						>
							<div class="max-h-[300px] overflow-y-auto custom-scrollbar"><EmojiPicker onEmojiSelected={handleEmojiSelected} /></div>
						</div>
					{/if}
				</div>
			</div>
		</div>
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
