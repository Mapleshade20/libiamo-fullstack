<script lang="ts">
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import Paperclip from "@lucide/svelte/icons/paperclip";
import Send from "@lucide/svelte/icons/send";
import X from "@lucide/svelte/icons/x";
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import ComposeHintPanel from "./ComposeHintPanel.svelte";
import ComposeToolbar, { type ComposeActiveFormats } from "./ComposeToolbar.svelte";
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
let activeFormats = $state<ComposeActiveFormats>({
	bold: false,
	italic: false,
	underline: false,
	strikeThrough: false,
	insertUnorderedList: false,
	insertOrderedList: false,
});
const isCompact = $derived(viewportWidth <= 640);
const editorIsEmpty = $derived(!draft.body.trim());
const editorDisabled = $derived(isSubmitting || isCompleted || limitReached);

const MIN_WIDTH = 560;
const MIN_HEIGHT = 440;
type EditorCommand =
	| "bold"
	| "italic"
	| "underline"
	| "strikeThrough"
	| "justifyLeft"
	| "justifyCenter"
	| "justifyRight"
	| "justifyFull"
	| "indent"
	| "outdent"
	| "insertUnorderedList"
	| "insertOrderedList"
	| "foreColor"
	| "fontSize"
	| "removeFormat";

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

function getPlainTextFromEditor() {
	if (!bodyEditor) return "";
	return bodyEditor.innerText
		.replace(/\u00a0/g, " ")
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.replace(/\n$/, "");
}

function updateActiveFormats() {
	activeFormats = {
		bold: document.queryCommandState("bold"),
		italic: document.queryCommandState("italic"),
		underline: document.queryCommandState("underline"),
		strikeThrough: document.queryCommandState("strikeThrough"),
		insertUnorderedList: document.queryCommandState("insertUnorderedList"),
		insertOrderedList: document.queryCommandState("insertOrderedList"),
	};
}

function syncDraftFromEditor() {
	if (!bodyEditor) return;
	const body = getPlainTextFromEditor();
	const bodyHtml = bodyEditor.innerHTML;
	lastAppliedEditorHtml = bodyHtml;
	draft = { ...draft, body, bodyHtml };
	updateActiveFormats();
}

function focusEditor() {
	bodyEditor?.focus();
}

function runEditorCommand(command: EditorCommand, value?: string) {
	if (!bodyEditor || editorDisabled) return;
	focusEditor();
	document.execCommand(command, false, value);
	syncDraftFromEditor();
}

function setAlignment(align: "left" | "center" | "right" | "justify") {
	const commandByAlignment = {
		left: "justifyLeft",
		center: "justifyCenter",
		right: "justifyRight",
		justify: "justifyFull",
	} as const;
	runEditorCommand(commandByAlignment[align]);
}

function indentSelection() {
	runEditorCommand("indent");
}

function outdentSelection() {
	runEditorCommand("outdent");
}

function toggleInlineFormat(command: "bold" | "italic" | "underline" | "strikeThrough") {
	runEditorCommand(command);
}

function toggleList(command: "insertUnorderedList" | "insertOrderedList") {
	runEditorCommand(command);
}

function applyTextColor(color: string) {
	runEditorCommand("foreColor", color);
}

function applyFontSize(value: string) {
	runEditorCommand("fontSize", value);
}

function clearFormatting() {
	runEditorCommand("removeFormat");
}

function handleEditorKeydown(event: KeyboardEvent) {
	if (event.key !== "Tab") return;
	event.preventDefault();
	runEditorCommand(event.shiftKey ? "outdent" : "indent");
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

	function handleSelectionChange() {
		if (bodyEditor?.contains(document.activeElement)) updateActiveFormats();
	}

	window.addEventListener("resize", handleResize);
	document.addEventListener("selectionchange", handleSelectionChange);
	return () => {
		window.removeEventListener("resize", handleResize);
		document.removeEventListener("selectionchange", handleSelectionChange);
	};
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
	<ComposeToolbar
		{activeFormats}
		{editorDisabled}
		{t}
		onToggleInlineFormat={toggleInlineFormat}
		onToggleList={toggleList}
		onApplyTextColor={applyTextColor}
		onApplyFontSize={applyFontSize}
		onOutdent={outdentSelection}
		onIndent={indentSelection}
		onSetAlignment={setAlignment}
		onClearFormatting={clearFormatting}
	/>
	<div class="editor-wrap min-h-0 flex-1">
		{#if editorIsEmpty}
			<div class="editor-placeholder">{isCompleted || limitReached ? t.questCompleted : t.composePlaceholder}</div>
		{/if}
		<div
			bind:this={bodyEditor}
			class="body-editor"
			class:is-disabled={editorDisabled}
			contenteditable={!editorDisabled}
			role="textbox"
			aria-multiline="true"
			tabindex="0"
			oninput={syncDraftFromEditor}
			onkeydown={handleEditorKeydown}
			onblur={syncDraftFromEditor}
			onpaste={handlePaste}
		></div>
	</div>
	{#if showHintPanel}
		<ComposeHintPanel {hint} {isGettingHint} {t} {onCloseHint} {onInsertHint} />
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
	min-height: 1.5em;
	margin: 0;
}

.body-editor :global(ul),
.body-editor :global(ol) {
	list-style-position: outside;
	margin: 0.4em 0;
	padding-left: 1.6em;
}

.body-editor :global(ul) {
	list-style-type: disc;
}

.body-editor :global(ol) {
	list-style-type: decimal;
}

.body-editor :global(ul ul) {
	list-style-type: circle;
}

.body-editor :global(ol ol),
.body-editor :global(ul ol) {
	list-style-type: lower-alpha;
}

.body-editor :global(li) {
	padding-left: 0.1em;
	display: list-item;
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
