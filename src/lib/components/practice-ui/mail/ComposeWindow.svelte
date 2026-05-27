<script lang="ts">
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import { MAIL_TEXT_MAX_LENGTH } from "$lib/constants";
import ComposeActionBar from "./ComposeActionBar.svelte";
import ComposeBodyEditor from "./ComposeBodyEditor.svelte";
import ComposeHeader from "./ComposeHeader.svelte";
import ComposeToolbar, { type ComposeActiveLayouts } from "./ComposeToolbar.svelte";
import { normalizeMailBodySpacing, plainTextToDraftHtml, sanitizeDraftBodyHtml } from "./mailUtils";
import type { DraftEmail } from "./types";

let {
	draft = $bindable({ to: "", subject: "", body: "" } as DraftEmail),
	isSubmitting = false,
	isCompleted = false,
	isInitializing = false,
	limitReached = false,
	sessionId = null as number | null,
	t = {} as Record<string, string>,
	onClose = () => {},
	onMockAction = () => {},
	onSend = () => {},
	onPersistDraft = (_draft: DraftEmail) => {},
}: {
	draft?: DraftEmail;
	isSubmitting?: boolean;
	isCompleted?: boolean;
	isInitializing?: boolean;
	limitReached?: boolean;
	sessionId?: number | null;
	t?: Record<string, string>;
	onClose?: () => void;
	onMockAction?: () => void;
	onSend?: () => void;
	onPersistDraft?: (draft: DraftEmail) => void;
} = $props();

let bodyEditor = $state<HTMLDivElement | null>(null);
let frame = $state({ x: 0, y: 0, width: 900, height: 680 });
let frameReady = $state(false);
let viewportWidth = $state(1024);
let lastAppliedEditorHtml = $state("");
let savedEditorRange = $state<Range | null>(null);
let savedEditorDomSelection = $state<SerializedEditorSelection | null>(null);
let isRestoringSelection = false;
let activeLayouts = $state<ComposeActiveLayouts>({
	insertUnorderedList: false,
	insertOrderedList: false,
});

const isCompact = $derived(viewportWidth <= 640);
const editorIsEmpty = $derived(!draft.body.trim());
const editorDisabled = $derived(isSubmitting || isCompleted || limitReached);

const MIN_WIDTH = 560;
const MIN_HEIGHT = 440;

type StructuralEditorCommand =
	| "justifyLeft"
	| "justifyCenter"
	| "justifyRight"
	| "justifyFull"
	| "indent"
	| "outdent"
	| "insertUnorderedList"
	| "insertOrderedList"
	| "undo"
	| "redo"
	| "insertHTML"
	| "insertText";

type SerializedSelectionPoint = {
	path: number[];
	offset: number;
};

type SerializedEditorSelection = {
	anchor: SerializedSelectionPoint;
	focus: SerializedSelectionPoint;
	collapsed: boolean;
};

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

function getSelectedEditorTextLength() {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return 0;
	const range = selection.getRangeAt(0);
	if (!selectionBelongsToEditor(range)) return 0;
	return selection.toString().length;
}

function selectionBelongsToEditor(range: Range) {
	if (!bodyEditor) return false;
	const container = range.commonAncestorContainer;
	return bodyEditor === container || bodyEditor.contains(container);
}

function getNodePath(root: Node, node: Node): number[] | null {
	const path: number[] = [];
	let current: Node | null = node;

	while (current && current !== root) {
		const parent: Node | null = current.parentNode;
		if (!parent) return null;
		path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
		current = parent;
	}

	return current === root ? path : null;
}

function getNodeFromPath(root: Node, path: number[]): Node | null {
	let current: Node | null = root;

	for (const index of path) {
		if (!current || index < 0 || index >= current.childNodes.length) return null;
		current = current.childNodes[index] ?? null;
	}

	return current;
}

function getMaxNodeOffset(node: Node) {
	return node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length;
}

function serializeEditorSelection(selection: Selection, range: Range): SerializedEditorSelection | null {
	if (!bodyEditor || !selection.anchorNode || !selection.focusNode) return null;
	if (!selectionBelongsToEditor(range)) return null;

	const anchorPath = getNodePath(bodyEditor, selection.anchorNode);
	const focusPath = getNodePath(bodyEditor, selection.focusNode);
	if (!anchorPath || !focusPath) return null;

	return {
		anchor: { path: anchorPath, offset: selection.anchorOffset },
		focus: { path: focusPath, offset: selection.focusOffset },
		collapsed: selection.isCollapsed,
	};
}

function restoreEditorDomSelection(saved: SerializedEditorSelection) {
	if (!bodyEditor || typeof window === "undefined") return false;

	const selection = window.getSelection();
	if (!selection) return false;

	const anchorNode = getNodeFromPath(bodyEditor, saved.anchor.path);
	const focusNode = getNodeFromPath(bodyEditor, saved.focus.path);
	if (!anchorNode || !focusNode) return false;

	const anchorOffset = Math.min(saved.anchor.offset, getMaxNodeOffset(anchorNode));
	const focusOffset = Math.min(saved.focus.offset, getMaxNodeOffset(focusNode));

	try {
		focusEditor();
		selection.removeAllRanges();

		if (saved.collapsed) {
			selection.collapse(anchorNode, anchorOffset);
		} else {
			selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
		}

		if (!selection.rangeCount) return false;
		const range = selection.getRangeAt(0);
		if (!selectionBelongsToEditor(range)) return false;

		savedEditorRange = range.cloneRange();
		return true;
	} catch {
		return false;
	}
}

function saveEditorSelection() {
	if (!bodyEditor || typeof window === "undefined") return;

	const selection = window.getSelection();
	if (!selection?.rangeCount) return;

	const range = selection.getRangeAt(0);
	if (!selectionBelongsToEditor(range)) return;

	savedEditorRange = range.cloneRange();
	savedEditorDomSelection = serializeEditorSelection(selection, range);
}

function restoreEditorSelection() {
	if (!bodyEditor || typeof window === "undefined") return;

	const selection = window.getSelection();
	if (!selection) return;

	isRestoringSelection = true;

	if (savedEditorDomSelection && restoreEditorDomSelection(savedEditorDomSelection)) {
		isRestoringSelection = false;
		return;
	}

	focusEditor();
	selection.removeAllRanges();

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
	savedEditorDomSelection = serializeEditorSelection(selection, range);
	isRestoringSelection = false;
}

function focusEditor() {
	bodyEditor?.focus();
}

function updateActiveLayouts() {
	if (typeof document === "undefined") return;

	activeLayouts = {
		insertUnorderedList: document.queryCommandState("insertUnorderedList"),
		insertOrderedList: document.queryCommandState("insertOrderedList"),
	};
}

function syncDraftFromEditor() {
	if (!bodyEditor) return;
	let body = getPlainTextFromEditor();
	if (body.length > MAIL_TEXT_MAX_LENGTH) {
		body = body.slice(0, MAIL_TEXT_MAX_LENGTH);
		bodyEditor.innerText = body;
	}
	const bodyHtml = sanitizeDraftBodyHtml(bodyEditor.innerHTML);
	const nextDraft = { ...draft, body, bodyHtml };
	lastAppliedEditorHtml = bodyHtml;
	draft = nextDraft;
	onPersistDraft(nextDraft);
	saveEditorSelection();
	updateActiveLayouts();
}

function persistCurrentDraft() {
	if (bodyEditor) {
		syncDraftFromEditor();
		return;
	}

	onPersistDraft(draft);
}

function runEditorCommand(command: StructuralEditorCommand, value?: string) {
	if (!bodyEditor || editorDisabled) return;
	restoreEditorSelection();
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

function toggleList(command: "insertUnorderedList" | "insertOrderedList") {
	runEditorCommand(command);
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
	if (editorDisabled || event.inputType.startsWith("delete") || event.inputType.startsWith("history")) return;
	const insertedText = event.data ?? "";
	if (!insertedText) return;

	const remaining = MAIL_TEXT_MAX_LENGTH - (getPlainTextFromEditor().length - getSelectedEditorTextLength());
	if (remaining <= 0) {
		event.preventDefault();
		return;
	}
	if (insertedText.length > remaining) {
		event.preventDefault();
		restoreEditorSelection();
		document.execCommand("insertText", false, insertedText.slice(0, remaining));
		syncDraftFromEditor();
	}
}

function handlePaste(event: ClipboardEvent) {
	event.preventDefault();
	const remaining = MAIL_TEXT_MAX_LENGTH - (getPlainTextFromEditor().length - getSelectedEditorTextLength());
	if (remaining <= 0) return;

	const html = sanitizeDraftBodyHtml(event.clipboardData?.getData("text/html"), remaining);
	if (html) {
		runEditorCommand("insertHTML", html);
		return;
	}

	const text = (event.clipboardData?.getData("text/plain") ?? "").slice(0, remaining);
	if (!text) return;
	restoreEditorSelection();
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
		if (isRestoringSelection) return;
		if (bodyEditor?.contains(document.activeElement)) {
			saveEditorSelection();
			updateActiveLayouts();
		}
	}

	function handlePagePersistence() {
		persistCurrentDraft();
	}

	function handleVisibilityChange() {
		if (document.visibilityState === "hidden") persistCurrentDraft();
	}

	window.addEventListener("resize", handleResize);
	window.addEventListener("beforeunload", handlePagePersistence);
	window.addEventListener("pagehide", handlePagePersistence);
	document.addEventListener("selectionchange", handleSelectionChange);
	document.addEventListener("visibilitychange", handleVisibilityChange);
	return () => {
		window.removeEventListener("resize", handleResize);
		window.removeEventListener("beforeunload", handlePagePersistence);
		window.removeEventListener("pagehide", handlePagePersistence);
		document.removeEventListener("selectionchange", handleSelectionChange);
		document.removeEventListener("visibilitychange", handleVisibilityChange);
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
	<ComposeHeader
		bind:draft
		subjectDisabled={isSubmitting || isCompleted || limitReached}
		{t}
		{onClose}
		onStartDrag={startDrag}
		onDraftChange={onPersistDraft}
	/>
	<ComposeToolbar
		{activeLayouts}
		{editorDisabled}
		{t}
		onToggleList={toggleList}
		onOutdent={outdentSelection}
		onIndent={indentSelection}
		onSetAlignment={setAlignment}
		onUndo={undoEditorChange}
		onRedo={redoEditorChange}
		onPreserveEditorSelection={saveEditorSelection}
	/>
	<ComposeBodyEditor
		bind:editor={bodyEditor}
		isEmpty={editorIsEmpty}
		{editorDisabled}
		placeholder={isCompleted || limitReached ? t.questCompleted : t.composePlaceholder}
		onBeforeInput={handleEditorBeforeInput}
		onInput={syncDraftFromEditor}
		onKeydown={handleEditorKeydown}
		onKeyup={saveEditorSelection}
		onMouseup={saveEditorSelection}
		onFocus={saveEditorSelection}
		onBlur={syncDraftFromEditor}
		onPaste={handlePaste}
	/>
	<ComposeActionBar {draft} {sessionId} {isSubmitting} {isCompleted} {isInitializing} {limitReached} {t} {onMockAction} {onSend} />
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
