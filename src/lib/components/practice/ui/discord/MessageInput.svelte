<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Send from "@lucide/svelte/icons/send";
import Smile from "@lucide/svelte/icons/smile";
import { fade } from "svelte/transition";
import HintFloatingPanel from "$lib/components/practice/hint/HintFloatingPanel.svelte";
import { isImeKeyboardEvent } from "$lib/components/practice/hint/keyboard";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import { type LanguageCode, PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import EmojiPicker from "./EmojiPicker.svelte";
import { extractEmojiFromPickerEvent } from "./emoji";
import type { DiscordText } from "./i18n";
import { type DiscordMember, memberColor } from "./members";
import ResizeableTextarea from "./ResizeableTextarea.svelte";

const HINT_OWNER = "discord-input";

let {
	inputText = $bindable(""),
	session,
	language,
	placeholder,
	members,
	t,
}: {
	inputText?: string;
	session: PracticeSession;
	language: LanguageCode;
	placeholder: string;
	members: DiscordMember[];
	t: DiscordText;
} = $props();

let mentionIndex = $state(0);
let showEmojiPicker = $state(false);
let hintLayoutReference = $state<HTMLDivElement | null>(null);

const mentionQuery = $derived(inputText.match(/@([a-zA-Z0-9_]*)$/)?.[1] ?? null);
const mentionMembers = $derived(
	mentionQuery === null ? [] : members.filter((member) => member.name.toLowerCase().includes(mentionQuery.toLowerCase())),
);
const disabled = $derived(session.disabled);
const canSend = $derived(Boolean(inputText.trim()) && !disabled);
const hintLabel = $derived(translate(language, "practice.hint"));
const statusPlaceholder = $derived(
	session.isCompleted
		? translate(language, "practice.sessionEnded")
		: session.limitReached
			? translate(language, "practice.turnLimitReached")
			: session.isWaitingRetry
				? translate(language, "practice.retryFirst")
				: placeholder,
);

function limit(value: string) {
	return value.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);
}

function insertMention(member: DiscordMember) {
	inputText = limit(`${inputText.slice(0, inputText.lastIndexOf("@"))}@${member.name} `);
	mentionIndex = 0;
}

function toggleHint(event: MouseEvent) {
	if (event.currentTarget instanceof HTMLElement) session.hint.toggle(HINT_OWNER, event.currentTarget, () => ({ draft: inputText }));
}

async function submit() {
	if (!canSend) return;
	const text = limit(inputText);
	inputText = "";
	showEmojiPicker = false;
	session.hint.release(HINT_OWNER);
	if (!(await session.send(text)) && !inputText) inputText = text;
}

function handleKeyDown(event: KeyboardEvent) {
	if (isImeKeyboardEvent(event)) return;
	if (mentionMembers.length > 0) {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const step = event.key === "ArrowDown" ? 1 : -1;
			mentionIndex = (mentionIndex + step + mentionMembers.length) % mentionMembers.length;
			return;
		}
		if (event.key === "Enter" || event.key === "Tab") {
			event.preventDefault();
			insertMention(mentionMembers[mentionIndex] ?? mentionMembers[0]);
			return;
		}
	}
	if (event.key === "Enter" && !event.shiftKey && !window.matchMedia("(max-width: 768px)").matches) {
		event.preventDefault();
		void submit();
	}
}
</script>

<svelte:window
	onclick={(event) => {
		if (!(event.target instanceof Element) || !event.target.closest(".emoji-container-wrapper")) showEmojiPicker = false;
	}}
/>

<div class="relative shrink-0 px-3 pt-1 pb-6 md:px-4">
	{#if mentionMembers.length > 0}
		<div class="absolute bottom-[100%] left-4 z-50 mb-2 w-72 overflow-hidden rounded border border-[#1E1F22] bg-[#2B2D31] shadow-xl">
			<div class="bg-[#232428] px-3 py-2 text-xs font-bold text-[#949BA4] uppercase">{t.members}</div>
			<ul class="max-h-60 overflow-y-auto py-1">
				{#each mentionMembers as member, index (member.name)}
					<li class="mx-1">
						<button
							type="button"
							class="flex min-h-11 w-full items-center gap-2 rounded px-3 text-left hover:bg-[#35373C] {mentionIndex === index ? 'bg-[#35373C]' : ''}"
							onmouseenter={() => (mentionIndex = index)}
							onmousedown={(event) => {
								event.preventDefault();
								insertMention(member);
							}}
						>
							<span
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white {memberColor(member.name)}"
								aria-hidden="true"
							>
								{member.name.charAt(0)}
							</span>
							<span class="text-sm font-medium text-[#DBDEE1]">{member.name}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<div bind:this={hintLayoutReference} class="flex items-center gap-2">
		<button
			type="button"
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#4E5058] bg-[#3F4147] text-[#DBDEE1] shadow-sm transition-colors hover:border-[#5B5E66] hover:bg-[#4E5058] disabled:opacity-50 md:hidden"
			onclick={toggleHint}
			aria-label={hintLabel}
			aria-expanded={session.hint.isOpen(HINT_OWNER)}
			{disabled}
		>
			<Lightbulb size={20} class={session.hint.loading ? "animate-pulse text-yellow-400" : ""} aria-hidden="true" />
		</button>

		<div class="relative min-w-0 flex-1 rounded-lg bg-[#383A40] focus-within:ring-2 focus-within:ring-[#5865F2]/60">
			<div class="flex items-center px-2 md:px-4 {disabled ? 'opacity-50' : ''}">
				<div class="min-w-0 flex-1">
					<ResizeableTextarea
						bind:value={inputText}
						maxRows={10}
						maxLength={PRACTICE_UI_TEXT_MAX_LENGTH}
						{disabled}
						placeholder={statusPlaceholder}
						label={placeholder}
						onKeyDown={handleKeyDown}
					/>
				</div>

				<div class="relative ml-2 flex shrink-0 items-center justify-center gap-1 text-[#B5BAC1] md:ml-3">
					<button
						type="button"
						class="hidden h-11 w-11 place-items-center rounded transition-colors md:grid {session.hint.loading ? 'text-yellow-400' : 'hover:text-[#DBDEE1]'}"
						onclick={toggleHint}
						aria-label={hintLabel}
						aria-expanded={session.hint.isOpen(HINT_OWNER)}
						{disabled}
					>
						<Lightbulb size={22} class={session.hint.loading ? "animate-pulse" : ""} aria-hidden="true" />
					</button>

					<div class="emoji-container-wrapper relative flex items-center">
						<button
							type="button"
							class="grid h-11 w-11 place-items-center rounded transition-colors {showEmojiPicker ? 'text-white' : 'hover:text-[#DBDEE1]'}"
							onclick={() => (showEmojiPicker = !showEmojiPicker)}
							aria-label={t.emoji}
							aria-expanded={showEmojiPicker}
							{disabled}
						>
							<Smile size={22} aria-hidden="true" />
						</button>
						{#if showEmojiPicker}
							<div
								class="fixed inset-x-3 bottom-24 z-[1002] overflow-hidden rounded-lg border border-[#1E1F22] bg-[#232428] shadow-xl md:absolute md:inset-auto md:right-0 md:bottom-full md:mb-4 md:w-[360px]"
								transition:fade={{ duration: 100 }}
							>
								<div class="max-h-[300px] overflow-y-auto">
									<EmojiPicker
										onEmojiSelected={(event) => {
											inputText = limit(inputText + extractEmojiFromPickerEvent(event));
											showEmojiPicker = false;
										}}
									/>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<button
			type="button"
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors md:hidden {canSend ? 'bg-[#5865F2] text-white' : 'bg-[#383A40] text-[#80848E]'}"
			onclick={submit}
			disabled={!canSend}
			aria-label={translate(language, "practice.send")}
		>
			<Send size={18} aria-hidden="true" />
		</button>
	</div>

	{#if session.hint.isOpen(HINT_OWNER)}
		<HintFloatingPanel hint={session.hint} layoutReference={hintLayoutReference} {language} {disabled} />
	{/if}
</div>
