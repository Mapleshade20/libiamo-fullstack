<script lang="ts">
import AlignCenter from "@lucide/svelte/icons/align-center";
import AlignJustify from "@lucide/svelte/icons/align-justify";
import AlignLeft from "@lucide/svelte/icons/align-left";
import AlignRight from "@lucide/svelte/icons/align-right";
import IndentDecrease from "@lucide/svelte/icons/indent-decrease";
import IndentIncrease from "@lucide/svelte/icons/indent-increase";
import List from "@lucide/svelte/icons/list";
import ListOrdered from "@lucide/svelte/icons/list-ordered";
import Redo2 from "@lucide/svelte/icons/redo-2";
import Undo2 from "@lucide/svelte/icons/undo-2";

export type ComposeActiveFormats = {
	insertUnorderedList: boolean;
	insertOrderedList: boolean;
};

let {
	activeFormats = {
		insertUnorderedList: false,
		insertOrderedList: false,
	} as ComposeActiveFormats,
	editorDisabled = false,
	t = {} as Record<string, string>,
	onToggleList = (_command: "insertUnorderedList" | "insertOrderedList") => {},
	onOutdent = () => {},
	onIndent = () => {},
	onSetAlignment = (_align: "left" | "center" | "right" | "justify") => {},
	onUndo = () => {},
	onRedo = () => {},
	onPreserveEditorSelection = () => {},
}: {
	activeFormats?: ComposeActiveFormats;
	editorDisabled?: boolean;
	t?: Record<string, string>;
	onToggleList?: (command: "insertUnorderedList" | "insertOrderedList") => void;
	onOutdent?: () => void;
	onIndent?: () => void;
	onSetAlignment?: (align: "left" | "center" | "right" | "justify") => void;
	onUndo?: () => void;
	onRedo?: () => void;
	onPreserveEditorSelection?: () => void;
} = $props();

function handleToolbarPointerDown(event: PointerEvent) {
	onPreserveEditorSelection();
	if ((event.target as HTMLElement).closest("button")) {
		event.preventDefault();
	}
}
</script>

<div
	class="format-toolbar flex flex-wrap items-center gap-1 border-b border-black/10 bg-white px-3 py-2"
	role="toolbar"
	aria-label="Formatting"
	tabindex="-1"
	onpointerdown={handleToolbarPointerDown}
>
	<button type="button" class="format-button" title={t.undo} disabled={editorDisabled} onclick={onUndo}><Undo2 size={16} /></button>
	<button type="button" class="format-button" title={t.redo} disabled={editorDisabled} onclick={onRedo}><Redo2 size={16} /></button>
	<div class="mx-1 h-5 w-px bg-black/10"></div>
	<button
		type="button"
		class="format-button"
		class:is-active={activeFormats.insertUnorderedList}
		title={t.bulletedList}
		disabled={editorDisabled}
		onclick={() => onToggleList("insertUnorderedList")}
	>
		<List size={16} />
	</button>
	<button
		type="button"
		class="format-button"
		class:is-active={activeFormats.insertOrderedList}
		title={t.numberedList}
		disabled={editorDisabled}
		onclick={() => onToggleList("insertOrderedList")}
	>
		<ListOrdered size={16} />
	</button>
	<div class="mx-1 h-5 w-px bg-black/10"></div>
	<button type="button" class="format-button" title={t.outdent} disabled={editorDisabled} onclick={onOutdent}><IndentDecrease size={16} /></button>
	<button type="button" class="format-button" title={t.indent} disabled={editorDisabled} onclick={onIndent}><IndentIncrease size={16} /></button>
	<div class="mx-1 h-5 w-px bg-black/10"></div>
	<button type="button" class="format-button" title={t.alignLeft} disabled={editorDisabled} onclick={() => onSetAlignment("left")}>
		<AlignLeft size={16} />
	</button>
	<button type="button" class="format-button" title={t.alignCenter} disabled={editorDisabled} onclick={() => onSetAlignment("center")}>
		<AlignCenter size={16} />
	</button>
	<button type="button" class="format-button" title={t.alignRight} disabled={editorDisabled} onclick={() => onSetAlignment("right")}>
		<AlignRight size={16} />
	</button>
	<button type="button" class="format-button" title={t.alignJustify} disabled={editorDisabled} onclick={() => onSetAlignment("justify")}>
		<AlignJustify size={16} />
	</button>
</div>

<style>
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

.format-button.is-active {
	background: #dcecff;
	color: #0a64ff;
}

.format-button:disabled {
	cursor: not-allowed;
	opacity: 0.45;
}
</style>
