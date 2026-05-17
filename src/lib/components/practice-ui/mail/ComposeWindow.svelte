<script lang="ts">
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import ComposeActionBar from "./ComposeActionBar.svelte";
import ComposeBodyEditor from "./ComposeBodyEditor.svelte";
import ComposeHeader from "./ComposeHeader.svelte";
import ComposeHintPanel from "./ComposeHintPanel.svelte";
import ComposeToolbar, { type ComposeActiveFormats } from "./ComposeToolbar.svelte";
import { normalizeMailBodySpacing, plainTextToDraftHtml, sanitizeDraftBodyHtml } from "./mailUtils";
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
} = $props();

let bodyEditor = $state<HTMLDivElement | null>(null);
let frame = $state({ x: 0, y: 0, width: 900, height: 680 });
let frameReady = $state(false);
let viewportWidth = $state(1024);
let lastAppliedEditorHtml = $state("");
let savedEditorRange = $state<Range | null>(null);
let savedEditorSelection = $state<{ start: number; end: number } | null>(null);
let isRestoringSelection = false;
let selectedFontSize = $state("3");
let selectedTextColor = $state("#1D1D1F");
let pendingTypingStyle = $state<TypingStyle | null>(null);
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
const fontSizePixelsByCommandValue: Record<string, string> = {
	"2": "12px",
	"3": "14px",
	"4": "18px",
	"5": "24px",
};
const commandValueByFontSizePixels: Record<string, string> = {
	"12px": "2",
	"14px": "3",
	"18px": "4",
	"24px": "5",
};
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
	| "removeFormat"
	| "undo"
	| "redo";

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
	return normalizeMailBodySpacing(
		bodyEditor.innerText
			.replace(/\u00a0/g, " ")
			.replace(/[\u200B-\u200D\uFEFF]/g, "")
			.replace(/\n$/, ""),
	);
}

function updateActiveFormats() {
	const fontSize = document.queryCommandValue("fontSize");
	const typingStyle = getTypingStyleAtSelection();
	activeFormats = typingStyle
		? {
				bold: typingStyle.bold,
				italic: typingStyle.italic,
				underline: typingStyle.underline,
				strikeThrough: typingStyle.strikeThrough,
				insertUnorderedList: document.queryCommandState("insertUnorderedList"),
				insertOrderedList: document.queryCommandState("insertOrderedList"),
			}
		: {
				bold: document.queryCommandState("bold"),
				italic: document.queryCommandState("italic"),
				underline: document.queryCommandState("underline"),
				strikeThrough: document.queryCommandState("strikeThrough"),
				insertUnorderedList: document.queryCommandState("insertUnorderedList"),
				insertOrderedList: document.queryCommandState("insertOrderedList"),
			};
	if (typingStyle?.fontSize) selectedFontSize = typingStyle.fontSize;
	else if (typeof fontSize === "string" && /^[2-5]$/.test(fontSize)) selectedFontSize = fontSize;
	if (typingStyle?.color) selectedTextColor = typingStyle.color;
}

function selectionBelongsToEditor(range: Range) {
	if (!bodyEditor) return false;
	const container = range.commonAncestorContainer;
	return bodyEditor === container || bodyEditor.contains(container);
}

type TypingStyle = {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikeThrough: boolean;
	color: string;
	fontSize: string;
};

function getCurrentTypingStyle(): TypingStyle {
	return {
		bold: activeFormats.bold,
		italic: activeFormats.italic,
		underline: activeFormats.underline,
		strikeThrough: activeFormats.strikeThrough,
		color: selectedTextColor,
		fontSize: selectedFontSize,
	};
}

function getElementFromNode(node: Node | null) {
	if (!node) return null;
	return node instanceof HTMLElement ? node : node.parentElement;
}

function normalizeCssColor(value: string) {
	const normalized = value.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.toUpperCase();
	const match = normalized.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/);
	if (!match) return "";
	return `#${[match[1], match[2], match[3]]
		.map((part) => Number(part).toString(16).padStart(2, "0"))
		.join("")
		.toUpperCase()}`;
}

function getFontSizeCommandValue(element: HTMLElement) {
	const explicitSize = element.style.fontSize.trim().toLowerCase();
	if (commandValueByFontSizePixels[explicitSize]) return commandValueByFontSizePixels[explicitSize];
	const fontTagSize = element.tagName.toLowerCase() === "font" ? element.getAttribute("size") : null;
	return fontTagSize && /^[2-5]$/.test(fontTagSize) ? fontTagSize : "";
}

function getTypingStyleAtSelection(): TypingStyle | null {
	if (!bodyEditor || typeof window === "undefined") return null;
	const selection = window.getSelection();
	if (!selection?.rangeCount) return null;
	const range = selection.getRangeAt(0);
	if (!selectionBelongsToEditor(range)) return null;

	let bold = false;
	let italic = false;
	let underline = false;
	let strikeThrough = false;
	let color = "";
	let fontSize = "";
	let element = getElementFromNode(range.startContainer);

	while (element && element !== bodyEditor) {
		const tag = element.tagName.toLowerCase();
		const computedStyle = window.getComputedStyle(element);
		const fontWeight = (element.style.fontWeight || computedStyle.fontWeight).trim().toLowerCase();
		const fontStyle = (element.style.fontStyle || computedStyle.fontStyle).trim().toLowerCase();
		const textDecoration = `${element.style.textDecorationLine || ""} ${element.style.textDecoration || ""} ${computedStyle.textDecorationLine || ""}`;
		bold ||= tag === "b" || tag === "strong" || fontWeight === "bold" || Number.parseInt(fontWeight, 10) >= 600;
		italic ||= tag === "i" || tag === "em" || fontStyle === "italic";
		underline ||= tag === "u" || textDecoration.includes("underline");
		strikeThrough ||= tag === "s" || tag === "strike" || textDecoration.includes("line-through");
		color ||= normalizeCssColor(element.style.color || element.getAttribute("color") || computedStyle.color || "");
		fontSize ||= getFontSizeCommandValue(element);
		element = element.parentElement;
	}

	return { bold, italic, underline, strikeThrough, color: color || "#1D1D1F", fontSize: fontSize || "3" };
}

function applyTypingStyleToElement(element: HTMLElement, style: TypingStyle) {
	element.style.fontWeight = style.bold ? "bold" : "normal";
	element.style.fontStyle = style.italic ? "italic" : "normal";
	element.style.color = style.color;
	element.style.fontSize = fontSizePixelsByCommandValue[style.fontSize] ?? fontSizePixelsByCommandValue["3"];
	const decorations = [style.underline ? "underline" : "", style.strikeThrough ? "line-through" : ""].filter(Boolean);
	element.style.textDecorationLine = decorations.join(" ") || "none";
}

function setToolbarTypingStyle(style: TypingStyle) {
	activeFormats = {
		...activeFormats,
		bold: style.bold,
		italic: style.italic,
		underline: style.underline,
		strikeThrough: style.strikeThrough,
	};
	selectedFontSize = style.fontSize;
	selectedTextColor = style.color;
}

function getRangeTextOffsets(range: Range) {
	if (!bodyEditor || !selectionBelongsToEditor(range)) return null;
	const prefixRange = document.createRange();
	prefixRange.selectNodeContents(bodyEditor);
	prefixRange.setEnd(range.startContainer, range.startOffset);
	const start = prefixRange.toString().length;
	return { start, end: start + range.toString().length };
}

function getCurrentEditorSelection() {
	if (!bodyEditor || typeof window === "undefined") return null;
	const selection = window.getSelection();
	if (!selection?.rangeCount) return null;
	return getRangeTextOffsets(selection.getRangeAt(0));
}

function getEditorRangeFromTextOffsets(start: number, end: number) {
	if (!bodyEditor) return null;
	const range = document.createRange();
	const walker = document.createTreeWalker(bodyEditor, NodeFilter.SHOW_TEXT);
	let currentOffset = 0;
	let startSet = false;
	let endSet = false;
	let lastTextNode: Text | null = null;

	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		lastTextNode = node;
		const nextOffset = currentOffset + node.data.length;

		if (!startSet && start <= nextOffset) {
			range.setStart(node, Math.max(0, start - currentOffset));
			startSet = true;
		}

		if (!endSet && end <= nextOffset) {
			range.setEnd(node, Math.max(0, end - currentOffset));
			endSet = true;
			break;
		}

		currentOffset = nextOffset;
	}

	if (!startSet || !endSet) {
		if (lastTextNode) {
			const offset = lastTextNode.data.length;
			if (!startSet) range.setStart(lastTextNode, offset);
			if (!endSet) range.setEnd(lastTextNode, offset);
		} else {
			range.selectNodeContents(bodyEditor);
			range.collapse(false);
		}
	}

	return range;
}

function restoreEditorSelectionFromOffsets(selectionOffsets: { start: number; end: number }) {
	if (!bodyEditor || typeof window === "undefined") return false;
	const selection = window.getSelection();
	const range = getEditorRangeFromTextOffsets(selectionOffsets.start, selectionOffsets.end);
	if (!selection || !range) return false;
	isRestoringSelection = true;
	selection.removeAllRanges();
	selection.addRange(range);
	savedEditorRange = range.cloneRange();
	savedEditorSelection = selectionOffsets;
	isRestoringSelection = false;
	return true;
}

function getCurrentSelectionRange() {
	if (!bodyEditor || typeof window === "undefined") return null;
	const selection = window.getSelection();
	if (!selection?.rangeCount) return null;
	const range = selection.getRangeAt(0);
	return selectionBelongsToEditor(range) ? range : null;
}

function saveEditorSelection() {
	if (!bodyEditor || typeof window === "undefined") return;
	const selection = window.getSelection();
	if (!selection?.rangeCount) return;

	const range = selection.getRangeAt(0);
	if (!selectionBelongsToEditor(range)) return;
	savedEditorRange = range.cloneRange();
	savedEditorSelection = getRangeTextOffsets(range);
}

function restoreEditorSelection() {
	if (!bodyEditor || typeof window === "undefined") return;
	const selection = window.getSelection();
	if (!selection) return;

	isRestoringSelection = true;
	focusEditor();
	selection.removeAllRanges();

	if (savedEditorSelection) {
		const range = getEditorRangeFromTextOffsets(savedEditorSelection.start, savedEditorSelection.end);
		if (range) {
			selection.addRange(range);
			savedEditorRange = range.cloneRange();
			isRestoringSelection = false;
			return;
		}
	}

	if (savedEditorRange && selectionBelongsToEditor(savedEditorRange)) {
		selection.addRange(savedEditorRange);
		isRestoringSelection = false;
		return;
	}

	const range = document.createRange();
	range.selectNodeContents(bodyEditor);
	range.collapse(false);
	selection.addRange(range);
	savedEditorRange = range.cloneRange();
	isRestoringSelection = false;
}

function syncDraftFromEditor() {
	if (!bodyEditor) return;
	const body = getPlainTextFromEditor();
	const bodyHtml = bodyEditor.innerHTML;
	lastAppliedEditorHtml = bodyHtml;
	draft = { ...draft, body, bodyHtml };
	saveEditorSelection();
	updateActiveFormats();
}

function placeCaretAfter(node: Node) {
	if (typeof window === "undefined") return;
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.setStartAfter(node);
	range.collapse(true);
	isRestoringSelection = true;
	selection.removeAllRanges();
	selection.addRange(range);
	savedEditorRange = range.cloneRange();
	savedEditorSelection = getRangeTextOffsets(range);
	window.setTimeout(() => {
		isRestoringSelection = false;
	}, 0);
}

function insertStyledTextAtSelection(text: string, style: TypingStyle) {
	if (!bodyEditor || typeof window === "undefined") return false;
	const selection = window.getSelection();
	if (!selection?.rangeCount) return false;
	const range = selection.getRangeAt(0);
	if (!selectionBelongsToEditor(range)) return false;

	range.deleteContents();
	const span = document.createElement("span");
	applyTypingStyleToElement(span, style);
	span.textContent = text;
	range.insertNode(span);
	placeCaretAfter(span);
	return true;
}

function focusEditor() {
	bodyEditor?.focus();
}

function runEditorCommand(command: EditorCommand, value?: string) {
	if (!bodyEditor || editorDisabled) return;
	const selectionBeforeCommand = savedEditorSelection ?? getCurrentEditorSelection();
	restoreEditorSelection();
	document.execCommand(command, false, value);
	if (selectionBeforeCommand && selectionBeforeCommand.start !== selectionBeforeCommand.end) {
		restoreEditorSelectionFromOffsets(selectionBeforeCommand);
	}
	pendingTypingStyle = null;
	syncDraftFromEditor();
}

function updateCollapsedTypingStyle(updater: (style: TypingStyle) => TypingStyle) {
	if (!bodyEditor || editorDisabled) return false;
	restoreEditorSelection();
	const range = getCurrentSelectionRange();
	if (!range?.collapsed) return false;
	const nextStyle = updater(pendingTypingStyle ?? getTypingStyleAtSelection() ?? getCurrentTypingStyle());
	pendingTypingStyle = nextStyle;
	setToolbarTypingStyle(nextStyle);
	saveEditorSelection();
	return true;
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
	if (
		updateCollapsedTypingStyle((style) => ({
			...style,
			[command]: !style[command],
		}))
	) {
		return;
	}
	runEditorCommand(command);
}

function toggleList(command: "insertUnorderedList" | "insertOrderedList") {
	runEditorCommand(command);
}

function applyTextColor(color: string) {
	if (
		updateCollapsedTypingStyle((style) => ({
			...style,
			color,
		}))
	) {
		return;
	}
	runEditorCommand("foreColor", color);
	selectedTextColor = color;
}

function applyFontSize(value: string) {
	if (/^[2-5]$/.test(value)) {
		if (
			updateCollapsedTypingStyle((style) => ({
				...style,
				fontSize: value,
			}))
		) {
			return;
		}
	}
	runEditorCommand("fontSize", value);
	if (/^[2-5]$/.test(value)) selectedFontSize = value;
}

function clearFormatting() {
	if (
		updateCollapsedTypingStyle((style) => ({
			...style,
			bold: false,
			italic: false,
			underline: false,
			strikeThrough: false,
			color: "#1D1D1F",
			fontSize: "3",
		}))
	) {
		return;
	}
	runEditorCommand("removeFormat");
}

function undoEditorChange() {
	runEditorCommand("undo");
}

function redoEditorChange() {
	runEditorCommand("redo");
}

function handleEditorKeydown(event: KeyboardEvent) {
	if (event.key !== "Tab") return;
	event.preventDefault();
	runEditorCommand(event.shiftKey ? "outdent" : "indent");
}

function handleEditorBeforeInput(event: InputEvent) {
	if (!pendingTypingStyle || editorDisabled || event.inputType !== "insertText" || !event.data) return;
	event.preventDefault();
	restoreEditorSelection();
	if (insertStyledTextAtSelection(event.data, pendingTypingStyle)) {
		syncDraftFromEditor();
		setToolbarTypingStyle(pendingTypingStyle);
	}
}

function handlePaste(event: ClipboardEvent) {
	event.preventDefault();
	const html = event.clipboardData?.getData("text/html") ?? "";
	const text = event.clipboardData?.getData("text/plain") ?? "";
	const sanitizedHtml = sanitizeDraftBodyHtml(html);
	if (sanitizedHtml) {
		document.execCommand("insertHTML", false, sanitizedHtml);
	} else {
		document.execCommand("insertText", false, text);
	}
	syncDraftFromEditor();
}

function splitSubjectFromHint(text: string) {
	const lines = text.trim().split(/\r?\n/);
	const subjectLineIndex = lines.findIndex((line) => /^subject\s*:/i.test(line.trim()));
	if (subjectLineIndex === -1) return { subject: "", body: text.trim() };

	const subject = lines[subjectLineIndex]?.replace(/^subject\s*:/i, "").trim() ?? "";
	const body = lines
		.filter((_, index) => index !== subjectLineIndex)
		.join("\n")
		.trim();
	return { subject, body };
}

function insertTextAtCursor(text: string) {
	if (!bodyEditor || editorDisabled || !text.trim()) return;
	restoreEditorSelection();
	document.execCommand("insertText", false, text);
	syncDraftFromEditor();
}

function insertHintText(text: string, kind: "body" | "subject" = "body") {
	const parsed = splitSubjectFromHint(text);
	const subject =
		kind === "subject"
			? text
					.trim()
					.replace(/^subject\s*:/i, "")
					.trim()
			: parsed.subject;
	const bodyText = kind === "subject" ? "" : parsed.body;

	if (subject) draft = { ...draft, subject };
	if (bodyText) insertTextAtCursor(bodyText);
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
		if (isRestoringSelection) return;
		if (bodyEditor?.contains(document.activeElement)) {
			pendingTypingStyle = null;
			saveEditorSelection();
			updateActiveFormats();
		}
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
	<ComposeHeader bind:draft subjectDisabled={isSubmitting || isCompleted || limitReached} {t} {onClose} onStartDrag={startDrag} />
	<ComposeToolbar
		{activeFormats}
		{selectedFontSize}
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
		onUndo={undoEditorChange}
		onRedo={redoEditorChange}
		onPreserveEditorSelection={saveEditorSelection}
	/>
	<ComposeBodyEditor
		bind:editor={bodyEditor}
		isEmpty={editorIsEmpty}
		{editorDisabled}
		placeholder={isCompleted || limitReached ? t.questCompleted : t.composePlaceholder}
		onInput={syncDraftFromEditor}
		onKeydown={handleEditorKeydown}
		onBeforeInput={handleEditorBeforeInput}
		onKeyup={saveEditorSelection}
		onMouseup={saveEditorSelection}
		onFocus={saveEditorSelection}
		onBlur={syncDraftFromEditor}
		onPaste={handlePaste}
	/>
	{#if showHintPanel}
		<ComposeHintPanel {hint} {isGettingHint} {t} {onCloseHint} onInsertHint={insertHintText} />
	{/if}
	<ComposeActionBar
		{draft}
		{sessionId}
		{isSubmitting}
		{isCompleted}
		{isInitializing}
		{isGettingHint}
		{limitReached}
		{t}
		{onMockAction}
		{onGetHint}
		{onSend}
	/>
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

	.resize-grip {
		display: none;
	}
}
</style>
