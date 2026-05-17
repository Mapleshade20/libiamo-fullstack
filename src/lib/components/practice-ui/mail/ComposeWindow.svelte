<script lang="ts">
import { onMount } from "svelte";
import { fly } from "svelte/transition";
import ComposeActionBar from "./ComposeActionBar.svelte";
import ComposeBodyEditor from "./ComposeBodyEditor.svelte";
import ComposeHeader from "./ComposeHeader.svelte";
import ComposeHintPanel from "./ComposeHintPanel.svelte";
import ComposeToolbar, { type ComposeActiveFormats } from "./ComposeToolbar.svelte";
import { normalizeMailBodySpacing, plainTextToDraftHtml } from "./mailUtils";
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
let savedEditorDomSelection = $state<SerializedEditorSelection | null>(null);
let isRestoringSelection = false;
let activeFormats = $state<ComposeActiveFormats>({
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

function updateActiveFormats() {
	if (typeof document === "undefined") return;

	activeFormats = {
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
	saveEditorSelection();
	updateActiveFormats();
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

function handlePaste(event: ClipboardEvent) {
	event.preventDefault();
	const text = event.clipboardData?.getData("text/plain") ?? "";
	if (!text) return;
	restoreEditorSelection();
	document.execCommand("insertText", false, text);
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
	runEditorCommand("insertText", text);
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
		onInput={syncDraftFromEditor}
		onKeydown={handleEditorKeydown}
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
