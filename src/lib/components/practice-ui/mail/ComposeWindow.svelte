<script lang="ts">
import AlignLeft from "@lucide/svelte/icons/align-left";
import AlignRight from "@lucide/svelte/icons/align-right";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Circle from "@lucide/svelte/icons/circle";
import IndentIncrease from "@lucide/svelte/icons/indent-increase";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import Paperclip from "@lucide/svelte/icons/paperclip";
import Send from "@lucide/svelte/icons/send";
import X from "@lucide/svelte/icons/x";
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import { plainTextToDraftHtml } from "./mailUtils";
import type { DraftEmail, MailHint } from "./types";

let {
	draft = $bindable({ to: "", subject: "", body: "" } as DraftEmail),
	isSubmitting = false,
	isCompleted = false,
	isInitializing = false,
	limitReached = false,
	sessionId = null as number | null,
	hint = null as MailHint | null,
	isGettingHint = false,
	showHintPanel = false,
	t = {} as Record<string, string>,
	onClose = () => {},
	onMockAction = () => {},
	onSend = () => {},
	onGetHint = () => {},
	onCloseHint = () => {},
	onInsertHint = (_text: string, _kind?: "body" | "subject") => {},
}: {
	draft?: DraftEmail;
	isSubmitting?: boolean;
	isCompleted?: boolean;
	isInitializing?: boolean;
	limitReached?: boolean;
	sessionId?: number | null;
	hint?: MailHint | null;
	isGettingHint?: boolean;
	showHintPanel?: boolean;
	t?: Record<string, string>;
	onClose?: () => void;
	onMockAction?: () => void;
	onSend?: () => void;
	onGetHint?: () => void;
	onCloseHint?: () => void;
	onInsertHint?: (text: string, kind?: "body" | "subject") => void;
} = $props();

let bodyEditor = $state<HTMLDivElement | null>(null);
let frame = $state({ x: 0, y: 0, width: 900, height: 680 });
let frameReady = $state(false);
let viewportWidth = $state(1024);
let lastAppliedEditorHtml = $state("");
const isCompact = $derived(viewportWidth <= 640);
const editorIsEmpty = $derived(!draft.body.trim());

const MIN_WIDTH = 560;
const MIN_HEIGHT = 440;

function constrainFrame(nextFrame = frame) {
	if (typeof window === "undefined") return nextFrame;
	const margin = 10;
	const width = Math.min(Math.max(nextFrame.width, MIN_WIDTH), Math.max(MIN_WIDTH, window.innerWidth - margin * 2));
	const height = Math.min(Math.max(nextFrame.height, MIN_HEIGHT), Math.max(MIN_HEIGHT, window.innerHeight - margin * 2));
	const x = Math.min(Math.max(nextFrame.x, margin), Math.max(margin, window.innerWidth - width - margin));
	const y = Math.min(Math.max(nextFrame.y, margin), Math.max(margin, window.innerHeight - height - margin));
	return { x, y, width, height };
}

function startDrag(event: PointerEvent) {
	const target = event.target as HTMLElement;
	if (target.closest("button")) return;
	event.preventDefault();

	const startX = event.clientX;
	const startY = event.clientY;
	const startFrame = frame;

	function handleMove(moveEvent: PointerEvent) {
		frame = constrainFrame({
			...startFrame,
			x: startFrame.x + moveEvent.clientX - startX,
			y: startFrame.y + moveEvent.clientY - startY,
		});
	}

	function handleUp() {
		window.removeEventListener("pointermove", handleMove);
		window.removeEventListener("pointerup", handleUp);
	}

	window.addEventListener("pointermove", handleMove);
	window.addEventListener("pointerup", handleUp);
}

function startResize(event: PointerEvent) {
	event.preventDefault();
	event.stopPropagation();

	const startX = event.clientX;
	const startY = event.clientY;
	const startFrame = frame;

	function handleMove(moveEvent: PointerEvent) {
		frame = constrainFrame({
			...startFrame,
			width: startFrame.width + moveEvent.clientX - startX,
			height: startFrame.height + moveEvent.clientY - startY,
		});
	}

	function handleUp() {
		window.removeEventListener("pointermove", handleMove);
		window.removeEventListener("pointerup", handleUp);
	}

	window.addEventListener("pointermove", handleMove);
	window.addEventListener("pointerup", handleUp);
}

function syncDraftFromEditor() {
	if (!bodyEditor) return;
	const body = bodyEditor.innerText.replace(/\u00a0/g, " ").replace(/\n$/, "");
	const bodyHtml = bodyEditor.innerHTML;
	lastAppliedEditorHtml = bodyHtml;
	draft = { ...draft, body, bodyHtml };
}

function focusEditor() {
	bodyEditor?.focus();
}

function runEditorCommand(command: "justifyLeft" | "justifyRight" | "indent") {
	if (!bodyEditor) return;
	focusEditor();
	document.execCommand(command, false);
	syncDraftFromEditor();
}

function setAlignment(align: "left" | "right") {
	runEditorCommand(align === "right" ? "justifyRight" : "justifyLeft");
}

function indentSelection() {
	runEditorCommand("indent");
}

function handlePaste(event: ClipboardEvent) {
	event.preventDefault();
	const text = event.clipboardData?.getData("text/plain") ?? "";
	document.execCommand("insertText", false, text);
	syncDraftFromEditor();
}

onMount(() => {
	const width = Math.min(920, window.innerWidth - 72);
	const height = Math.min(700, window.innerHeight - 72);
	frame = constrainFrame({
		width,
		height,
		x: (window.innerWidth - width) / 2,
		y: Math.max(36, (window.innerHeight - height) / 2),
	});
	frameReady = true;

	function handleResize() {
		frame = constrainFrame();
	}

	window.addEventListener("resize", handleResize);
	return () => window.removeEventListener("resize", handleResize);
});

$effect(() => {
	if (!bodyEditor) return;
	const nextHtml = draft.bodyHtml ?? plainTextToDraftHtml(draft.body);
	if (nextHtml === lastAppliedEditorHtml || nextHtml === bodyEditor.innerHTML) return;
	bodyEditor.innerHTML = nextHtml;
	lastAppliedEditorHtml = nextHtml;
});
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<div
	class="compose-window"
	class:frame-ready={frameReady}
	style:left={isCompact ? null : `${frame.x}px`}
	style:top={isCompact ? null : `${frame.y}px`}
	style:width={isCompact ? null : `${frame.width}px`}
	style:height={isCompact ? null : `${frame.height}px`}
	transition:fly={{ y: 24, duration: 180 }}
>
	<div class="compose-titlebar flex h-11 items-center gap-2 rounded-t-xl bg-[#F2F2F7] px-4" role="presentation" onpointerdown={startDrag}>
		<span class="text-sm font-semibold">{t.newMessage}</span>
		<button type="button" class="ml-auto rounded p-1 text-[#6E6E73] hover:bg-black/10 hover:text-[#1D1D1F]" onclick={onClose}><X size={17} /></button>
	</div>
	<label class="compose-line">
		<span>{t.to}:</span>
		<input value={draft.to} readonly aria-readonly="true" class="readonly-field">
	</label>
	<label class="compose-line">
		<span>{t.subject}:</span>
		<input bind:value={draft.subject} disabled={isSubmitting || isCompleted || limitReached}>
	</label>
	<div class="format-toolbar flex items-center gap-1 border-b border-black/10 bg-white px-3 py-2">
		<button type="button" class="format-button" title={t.indent} disabled={isSubmitting || isCompleted || limitReached} onclick={indentSelection}>
			<IndentIncrease size={16} />
		</button>
		<div class="mx-1 h-5 w-px bg-black/10"></div>
		<button
			type="button"
			class="format-button"
			title={t.alignLeft}
			disabled={isSubmitting || isCompleted || limitReached}
			onclick={() => setAlignment("left")}
		>
			<AlignLeft size={16} />
		</button>
		<button
			type="button"
			class="format-button"
			title={t.alignRight}
			disabled={isSubmitting || isCompleted || limitReached}
			onclick={() => setAlignment("right")}
		>
			<AlignRight size={16} />
		</button>
	</div>
	<div class="editor-wrap min-h-0 flex-1">
		{#if editorIsEmpty}
			<div class="editor-placeholder">{isCompleted || limitReached ? t.questCompleted : t.composePlaceholder}</div>
		{/if}
		<div
			bind:this={bodyEditor}
			class="body-editor"
			class:is-disabled={isSubmitting || isCompleted || limitReached}
			contenteditable={!(isSubmitting || isCompleted || limitReached)}
			role="textbox"
			aria-multiline="true"
			tabindex="0"
			oninput={syncDraftFromEditor}
			onblur={syncDraftFromEditor}
			onpaste={handlePaste}
		></div>
	</div>
	{#if showHintPanel}
		<div class="hint-panel border-t border-black/10 bg-[#FBFBFD] p-3">
			<div class="mb-2 flex items-center justify-between">
				<div class="flex items-center gap-2 text-sm font-semibold text-[#1D1D1F]">
					<Lightbulb size={16} class="text-[#FF9F0A]" />
					{t.hintTitle}
				</div>
				<button type="button" class="rounded p-1 text-[#6E6E73] hover:bg-black/10 hover:text-[#1D1D1F]" onclick={onCloseHint}><X size={15} /></button>
			</div>
			{#if isGettingHint}
				<div class="flex items-center gap-2 py-5 text-sm text-[#6E6E73]">
					<LoaderCircle size={16} class="animate-spin" />
					{t.thinking}
				</div>
			{:else if hint}
				{#if hint.subjectSuggestion?.text}
					<div class="mb-3 rounded-lg border border-[#D1E3FF] bg-[#F2F7FF] p-3">
						<div class="hint-card-title">{t.subject}</div>
						<p class="mt-1 text-sm leading-snug text-[#1D1D1F]">{hint.subjectSuggestion.text}</p>
						<button type="button" class="hint-insert" onclick={() => onInsertHint(hint.subjectSuggestion.text, "subject")}>{t.insert}</button>
					</div>
				{/if}
				<div class="grid gap-3 md:grid-cols-[1fr_1fr]">
					<div class="hint-card">
						<div class="hint-card-title">{t.nextSection}</div>
						<div class="hint-card-subtitle">{hint.nextSection.title}</div>
						<p>{hint.nextSection.text}</p>
						<button type="button" class="hint-insert" onclick={() => onInsertHint(hint.nextSection.text, "body")}>{t.insert}</button>
					</div>
					<div class="hint-card">
						<div class="hint-card-title">{t.nextSentence}</div>
						<div class="hint-card-subtitle">{hint.nextSentence.title}</div>
						<p>{hint.nextSentence.text}</p>
						<button type="button" class="hint-insert" onclick={() => onInsertHint(hint.nextSentence.text, "body")}>{t.insert}</button>
					</div>
				</div>
				<div class="mt-3 rounded-lg border border-black/10 bg-white p-3">
					<div class="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6E6E73]">{t.checklist}</div>
					<div class="space-y-2">
						{#each hint.checklist as item}
							<div class="flex gap-2 text-sm">
								{#if item.done}
									<CheckCircle2 size={17} class="mt-0.5 shrink-0 text-[#34C759]" />
								{:else}
									<Circle size={17} class="mt-0.5 shrink-0 text-[#8E8E93]" />
								{/if}
								<div class="min-w-0">
									<div class="font-medium text-[#1D1D1F]">{item.text}</div>
									<div class="text-xs leading-snug text-[#6E6E73]">{item.note}</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
	<div class="flex items-center gap-2 border-t border-black/10 bg-[#F7F7F9] px-4 py-3">
		<button type="button" class="icon-button" onclick={onMockAction}><Paperclip size={17} /></button>
		<button
			type="button"
			class="inline-flex items-center gap-2 rounded-md border border-[#FFD18A] bg-[#FFF7E8] px-3 py-2 text-sm font-semibold text-[#8A4B00] hover:bg-[#FFEBC2] disabled:cursor-not-allowed disabled:opacity-50"
			disabled={!sessionId || isCompleted || isInitializing || isGettingHint || limitReached}
			onclick={onGetHint}
		>
			{#if isGettingHint}
				<LoaderCircle size={15} class="animate-spin" />
			{:else}
				<Lightbulb size={15} />
			{/if}
			{t.writingAssist}
		</button>
		<button
			type="button"
			class="ml-auto inline-flex items-center gap-2 rounded-md bg-[#3478F6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A64FF] disabled:cursor-not-allowed disabled:opacity-50"
			disabled={!draft.to.trim() || !draft.body.trim() || isSubmitting || isCompleted || isInitializing || !sessionId || limitReached}
			onclick={onSend}
		>
			{#if isSubmitting}
				<LoaderCircle size={15} class="animate-spin" />
				{t.sending}
			{:else}
				<Send size={15} />
				{t.send}
			{/if}
		</button>
	</div>
	<div class="resize-grip" role="presentation" onpointerdown={startResize}></div>
</div>

<style>
.compose-window {
	position: absolute;
	z-index: 1200;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	border: 1px solid rgba(0, 0, 0, 0.16);
	border-radius: 12px;
	background: white;
	box-shadow: 0 22px 70px rgba(0, 0, 0, 0.24);
	opacity: 0;
}

.compose-window.frame-ready {
	opacity: 1;
}

.compose-titlebar {
	cursor: move;
	user-select: none;
}

.compose-line {
	display: flex;
	min-height: 42px;
	align-items: center;
	gap: 10px;
	border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	padding: 0 14px;
	font-size: 0.9rem;
}

.compose-line span {
	width: 64px;
	color: #6e6e73;
}

.compose-line input {
	min-width: 0;
	flex: 1;
	background: transparent;
	outline: none;
}

.readonly-field {
	color: #6e6e73;
	cursor: default;
}

.format-button {
	display: inline-flex;
	height: 28px;
	width: 30px;
	align-items: center;
	justify-content: center;
	border-radius: 6px;
	color: #6e6e73;
}

.format-button:hover {
	background: #e5e5ea;
	color: #1d1d1f;
}

.format-button:disabled {
	cursor: not-allowed;
	opacity: 0.45;
}

.editor-wrap {
	position: relative;
	overflow: auto;
	background: white;
}

.body-editor {
	min-height: 100%;
	padding: 16px;
	font-size: 15px;
	line-height: 1.5;
	outline: none;
	white-space: pre-wrap;
	word-break: break-word;
}

.body-editor :global(div),
.body-editor :global(p) {
	margin: 0 0 1em;
}

.body-editor :global(div:last-child),
.body-editor :global(p:last-child) {
	margin-bottom: 0;
}

.body-editor.is-disabled {
	pointer-events: none;
	opacity: 0.5;
}

.editor-placeholder {
	pointer-events: none;
	position: absolute;
	left: 16px;
	top: 16px;
	z-index: 1;
	color: #8e8e93;
	font-size: 15px;
	line-height: 1.5;
}

.hint-panel {
	max-height: min(340px, 45dvh);
	overflow-y: auto;
}

.hint-card {
	border: 1px solid rgba(0, 0, 0, 0.1);
	border-radius: 9px;
	background: white;
	padding: 12px;
}

.hint-card-title {
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	color: #6e6e73;
}

.hint-card-subtitle {
	margin-top: 3px;
	font-size: 0.85rem;
	font-weight: 650;
	color: #1d1d1f;
}

.hint-card p {
	margin-top: 8px;
	white-space: pre-wrap;
	font-size: 0.86rem;
	line-height: 1.45;
	color: #3a3a3c;
}

.hint-insert {
	margin-top: 10px;
	border-radius: 6px;
	background: #3478f6;
	padding: 6px 10px;
	font-size: 0.8rem;
	font-weight: 700;
	color: white;
}

.hint-insert:hover {
	background: #0a64ff;
}

.resize-grip {
	position: absolute;
	right: 0;
	bottom: 0;
	height: 18px;
	width: 18px;
	cursor: nwse-resize;
}

.resize-grip::after {
	position: absolute;
	right: 4px;
	bottom: 4px;
	height: 8px;
	width: 8px;
	border-bottom: 2px solid rgba(0, 0, 0, 0.22);
	border-right: 2px solid rgba(0, 0, 0, 0.22);
	content: "";
}

@media (max-width: 640px) {
	.compose-window {
		inset: 10px;
		opacity: 1;
	}

	.compose-titlebar {
		cursor: default;
	}

	.resize-grip {
		display: none;
	}
}
</style>
