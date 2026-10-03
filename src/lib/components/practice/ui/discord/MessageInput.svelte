<script lang="ts">
import CircleX from "@lucide/svelte/icons/circle-x";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import Send from "@lucide/svelte/icons/send";
import Smile from "@lucide/svelte/icons/smile";
import { tick } from "svelte";
import { fade } from "svelte/transition";
import HintFloatingPanel from "$lib/components/practice/hint/HintFloatingPanel.svelte";
import { isImeKeyboardEvent } from "$lib/components/practice/hint/keyboard";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import { type LanguageCode, PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { getSceneMessageRef } from "$lib/practice/comment-thread";
import { type DiscordMember, memberColor } from "$lib/practice/discord-members";
import type { ChatMessage } from "$lib/practice/messages";
import EmojiPicker from "./EmojiPicker.svelte";
import { extractEmojiFromPickerEvent } from "./emoji";
import { getMentionQuery } from "./helpers";
import type { DiscordText } from "./i18n";
import ResizeableTextarea from "./ResizeableTextarea.svelte";

const HINT_OWNER = "discord-input";

let {
	inputText = $bindable(""),
	session,
	language,
	placeholder,
	members,
	replyingTo = $bindable(null),
	textarea = $bindable(),
	t,
}: {
	inputText?: string;
	session: PracticeSession;
	language: LanguageCode;
	placeholder: string;
	members: DiscordMember[];
	/** The message the next send quotes, chosen from its hover toolbar. */
	replyingTo?: ChatMessage | null;
	textarea?: HTMLTextAreaElement;
	t: DiscordText;
} = $props();

const MENTION_LIST_ID = "discord-mention-list";
let mentionIndex = $state(0);
let caret = $state(0);
/** The `@` position whose suggestions were dismissed with Escape. */
let dismissedAt = $state<number | null>(null);
let showEmojiPicker = $state(false);
let hintLayoutReference = $state<HTMLDivElement | null>(null);

const mention = $derived(getMentionQuery(inputText, caret));
const mentionMembers = $derived(
	!mention || mention.start === dismissedAt
		? []
		: members.filter((member) => member.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 10),
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

function syncCaret() {
	caret = textarea?.selectionStart ?? inputText.length;
}

function handleInput() {
	syncCaret();
	mentionIndex = 0;
	// Escape dismisses one `@`; typing a new one offers suggestions again.
	if (mention?.start !== dismissedAt) dismissedAt = null;
}

async function insertMention(member: DiscordMember) {
	if (!mention) return;
	const before = `${inputText.slice(0, mention.start)}@${member.name} `;
	inputText = limit(before + inputText.slice(caret));
	mentionIndex = 0;
	await tick();
	textarea?.setSelectionRange(before.length, before.length);
	syncCaret();
}

function toggleHint(event: MouseEvent) {
	if (event.currentTarget instanceof HTMLElement) session.hint.toggle(HINT_OWNER, event.currentTarget, () => ({ draft: inputText }));
}

async function submit() {
	if (!canSend) return;
	const text = limit(inputText);
	const quoted = replyingTo;
	inputText = "";
	replyingTo = null;
	showEmojiPicker = false;
	session.hint.release(HINT_OWNER);
	if (!(await session.send(text, quoted ? { replyTo: getSceneMessageRef("discord", quoted) } : {})) && !inputText) {
		inputText = text;
		replyingTo ??= quoted;
	}
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
			void insertMention(mentionMembers[mentionIndex] ?? mentionMembers[0]);
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			dismissedAt = mention?.start ?? null;
			return;
		}
	}
	if (event.key === "Escape" && replyingTo) {
		event.preventDefault();
		replyingTo = null;
		return;
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
		<div
			class="absolute inset-x-3 bottom-full z-50 overflow-hidden rounded-lg bg-[#2B2D31] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_12px_24px_rgba(0,0,0,0.24)] md:inset-x-4"
		>
			<p id="{MENTION_LIST_ID}-title" class="px-3 pt-3 pb-1 text-xs font-semibold text-[#B5BAC1] uppercase">{t.members}</p>
			<ul id={MENTION_LIST_ID} role="listbox" aria-labelledby="{MENTION_LIST_ID}-title" class="max-h-72 overflow-y-auto px-2 pb-2">
				{#each mentionMembers as member, index (member.name)}
					<li
						id="{MENTION_LIST_ID}-{index}"
						role="option"
						aria-selected={mentionIndex === index}
						class="flex min-h-11 cursor-pointer items-center gap-2 rounded px-2 {mentionIndex === index ? 'bg-[#404249]' : ''}"
						onmouseenter={() => (mentionIndex = index)}
						onmousedown={(event) => {
							// Keep focus (and the caret) in the textarea.
							event.preventDefault();
							void insertMention(member);
						}}
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white {memberColor(member.name)}"
							aria-hidden="true"
						>
							{member.name.charAt(0).toUpperCase()}
						</span>
						<span class="truncate text-sm font-medium text-[#DBDEE1]">{member.name}</span>
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
			{#if replyingTo}
				{@const [lead, trail] = t.replyingTo.split("{name}")}
				<div class="flex min-h-11 items-center gap-2 rounded-t-lg bg-[#2B2D31] pr-1 pl-3 text-sm text-[#B5BAC1] md:min-h-9 md:pl-4">
					<p class="min-w-0 flex-1 truncate">{lead}<span class="font-semibold text-[#DBDEE1]">{replyingTo.authorName}</span>{trail}</p>
					<button
						type="button"
						class="grid h-11 w-11 shrink-0 place-items-center rounded text-[#B5BAC1] transition-colors hover:text-[#DBDEE1] md:h-9 md:w-9"
						aria-label={t.cancelReply}
						onclick={() => {
							replyingTo = null;
							textarea?.focus({ preventScroll: true });
						}}
					>
						<CircleX size={18} aria-hidden="true" />
					</button>
				</div>
			{/if}
			<div class="flex items-center px-2 md:px-4 {disabled ? 'opacity-50' : ''}">
				<div class="min-w-0 flex-1">
					<ResizeableTextarea
						bind:value={inputText}
						bind:textarea
						role="combobox"
						aria-autocomplete="list"
						aria-expanded={mentionMembers.length > 0}
						aria-controls={mentionMembers.length > 0 ? MENTION_LIST_ID : undefined}
						aria-activedescendant={mentionMembers.length > 0 ? `${MENTION_LIST_ID}-${mentionIndex}` : undefined}
						oninput={handleInput}
						onclick={syncCaret}
						onkeyup={syncCaret}
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
