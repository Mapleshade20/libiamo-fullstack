<script lang="ts">
import ArrowUp from "@lucide/svelte/icons/arrow-up";
import Image from "@lucide/svelte/icons/image";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import { onDestroy, tick, untrack } from "svelte";
import HintFloatingPanel from "$lib/components/practice/hint/HintFloatingPanel.svelte";
import { isImeKeyboardEvent } from "$lib/components/practice/hint/keyboard";
import type { PracticeSession } from "$lib/components/practice/session/session.svelte";
import { type LanguageCode, PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { t as translate } from "$lib/i18n";
import { getAvatarColor } from "./format";
import type { RedditText } from "./i18n";

let {
	session,
	owner,
	placeholder,
	contextPath,
	userName,
	avatarUrl,
	language,
	t,
	startExpanded = false,
	onSubmit,
	onCancel,
}: {
	session: PracticeSession;
	/** Identifies this editor as the hint panel's owner; unique per editor. */
	owner: string;
	placeholder: string;
	contextPath: Array<{ author: string; text: string }>;
	userName: string;
	avatarUrl: string;
	language: LanguageCode;
	t: RedditText;
	startExpanded?: boolean;
	onSubmit: (text: string) => Promise<boolean>;
	onCancel?: () => void;
} = $props();

let expanded = $state(untrack(() => startExpanded));
let text = $state("");
let textarea = $state<HTMLTextAreaElement | null>(null);
let editorBox = $state<HTMLDivElement | null>(null);

const disabled = $derived(session.disabled);

async function expand() {
	if (disabled) return;
	expanded = true;
	await tick();
	textarea?.focus();
}

function collapse() {
	expanded = false;
	text = "";
	session.hint.release(owner);
	onCancel?.();
}

async function submit() {
	const body = text.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);
	if (!body.trim() || disabled) return;
	text = "";
	session.hint.release(owner);
	if (await onSubmit(body)) {
		expanded = false;
		onCancel?.();
	} else if (!text) {
		text = body;
	}
}

function handleKeydown(event: KeyboardEvent) {
	if (isImeKeyboardEvent(event) || event.key !== "Enter" || event.shiftKey) return;
	if (window.matchMedia("(max-width: 768px)").matches) return;
	event.preventDefault();
	void submit();
}

onDestroy(() => session.hint.release(owner));
</script>

{#if !expanded}
	<button
		type="button"
		class="mb-2 flex min-h-11 w-full items-center gap-2 rounded-md border border-[#EDEFF1] bg-white px-3 text-left text-sm text-[#878A8C] transition-colors hover:border-[#898989] disabled:cursor-not-allowed disabled:opacity-50"
		onclick={expand}
		{disabled}
	>
		{#if avatarUrl}
			<img src={avatarUrl} alt="" class="h-6 w-6 shrink-0 rounded-full object-cover">
		{:else}
			<span
				class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white {getAvatarColor(userName)}"
				aria-hidden="true"
			>
				{userName.charAt(0).toUpperCase()}
			</span>
		{/if}
		<span>{placeholder}</span>
	</button>
{:else}
	<div class="relative mb-2">
		<div bind:this={editorBox} class="rounded-md border border-[#0079D3] bg-white focus-within:ring-2 focus-within:ring-[#0079D3]/25">
			<textarea
				bind:this={textarea}
				bind:value={text}
				maxlength={PRACTICE_UI_TEXT_MAX_LENGTH}
				rows="4"
				class="block min-h-[96px] w-full resize-none bg-white px-3 py-2.5 text-sm leading-6 text-[#1C1C1C] outline-none placeholder:text-[#878A8C] disabled:cursor-not-allowed disabled:bg-[#F6F7F8]"
				aria-label={placeholder}
				{placeholder}
				onkeydown={handleKeydown}
				{disabled}
			></textarea>

			<div class="flex items-center gap-1 border-t border-[#EDEFF1] bg-[#F6F7F8] px-2 py-1">
				<!-- Formatting tools are part of Reddit's look, not of the exercise. -->
				<span class="flex items-center gap-2 px-1 text-[#878A8C]/70" aria-hidden="true">
					<Image size={16} />
					<span class="text-xs font-bold">GIF</span>
					<span class="text-sm font-bold">Aa</span>
				</span>
				<div class="flex-1"></div>
				<button
					type="button"
					class="grid h-11 w-11 place-items-center rounded text-[#878A8C] transition-colors hover:bg-[#EDEFF1] hover:text-[#FF4500] disabled:opacity-40 md:h-8 md:w-8 {session.hint.isOpen(owner)
						? 'bg-[#FFF3EC] text-[#FF4500]'
						: ''}"
					onclick={(event) => session.hint.toggle(owner, event.currentTarget, () => ({ draft: text, contextPath }))}
					aria-label={translate(language, "practice.hint")}
					aria-expanded={session.hint.isOpen(owner)}
					disabled={disabled || !session.sessionId}
				>
					<Lightbulb size={14} class={session.hint.loading ? "animate-pulse text-[#FF4500]" : ""} aria-hidden="true" />
				</button>
				<button
					type="button"
					class="min-h-11 rounded-full border border-[#0079D3] px-3 text-xs font-bold text-[#0079D3] transition-colors hover:bg-[#E8F0FD] md:min-h-7"
					onclick={collapse}
				>
					{t.cancelReply}
				</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-1 rounded-full bg-[#FF4500] px-3 text-xs font-bold text-white transition-colors hover:bg-[#CC3700] disabled:bg-[#D1D1D6] md:min-h-7"
					onclick={submit}
					disabled={!text.trim() || disabled}
				>
					<ArrowUp size={12} aria-hidden="true" />
					{t.sendMessage}
				</button>
			</div>
		</div>
		{#if session.hint.isOpen(owner)}
			<HintFloatingPanel hint={session.hint} layoutReference={editorBox} {language} {disabled} />
		{/if}
	</div>
{/if}
