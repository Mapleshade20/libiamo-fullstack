<script lang="ts">
import AlignCenter from "@lucide/svelte/icons/align-center";
import AlignJustify from "@lucide/svelte/icons/align-justify";
import AlignLeft from "@lucide/svelte/icons/align-left";
import AlignRight from "@lucide/svelte/icons/align-right";
import Bold from "@lucide/svelte/icons/bold";
import Eraser from "@lucide/svelte/icons/eraser";
import IndentDecrease from "@lucide/svelte/icons/indent-decrease";
import IndentIncrease from "@lucide/svelte/icons/indent-increase";
import Italic from "@lucide/svelte/icons/italic";
import List from "@lucide/svelte/icons/list";
import ListOrdered from "@lucide/svelte/icons/list-ordered";
import Strikethrough from "@lucide/svelte/icons/strikethrough";
import Underline from "@lucide/svelte/icons/underline";

export type ComposeActiveFormats = {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strikeThrough: boolean;
	insertUnorderedList: boolean;
	insertOrderedList: boolean;
};

const TEXT_COLORS = ["#1D1D1F", "#D70015", "#B25000", "#248A3D", "#0066CC", "#7D3AC1"];
const FONT_SIZES = [
	{ label: "12", commandValue: "2" },
	{ label: "14", commandValue: "3" },
	{ label: "18", commandValue: "4" },
	{ label: "24", commandValue: "5" },
];

let {
	activeFormats = {
		bold: false,
		italic: false,
		underline: false,
		strikeThrough: false,
		insertUnorderedList: false,
		insertOrderedList: false,
	} as ComposeActiveFormats,
	editorDisabled = false,
	t = {} as Record<string, string>,
	onToggleInlineFormat = (_command: "bold" | "italic" | "underline" | "strikeThrough") => {},
	onToggleList = (_command: "insertUnorderedList" | "insertOrderedList") => {},
	onApplyTextColor = (_color: string) => {},
	onApplyFontSize = (_value: string) => {},
	onOutdent = () => {},
	onIndent = () => {},
	onSetAlignment = (_align: "left" | "center" | "right" | "justify") => {},
	onClearFormatting = () => {},
}: {
	activeFormats?: ComposeActiveFormats;
	editorDisabled?: boolean;
	t?: Record<string, string>;
	onToggleInlineFormat?: (command: "bold" | "italic" | "underline" | "strikeThrough") => void;
	onToggleList?: (command: "insertUnorderedList" | "insertOrderedList") => void;
	onApplyTextColor?: (color: string) => void;
	onApplyFontSize?: (value: string) => void;
	onOutdent?: () => void;
	onIndent?: () => void;
	onSetAlignment?: (align: "left" | "center" | "right" | "justify") => void;
	onClearFormatting?: () => void;
} = $props();
</script>

<div class="format-toolbar flex flex-wrap items-center gap-1 border-b border-black/10 bg-white px-3 py-2">
	<button
		type="button"
		class="format-button"
		class:is-active={activeFormats.bold}
		title={t.bold}
		disabled={editorDisabled}
		onclick={() => onToggleInlineFormat("bold")}
	>
		<Bold size={16} />
	</button>
	<button
		type="button"
		class="format-button"
		class:is-active={activeFormats.italic}
		title={t.italic}
		disabled={editorDisabled}
		onclick={() => onToggleInlineFormat("italic")}
	>
		<Italic size={16} />
	</button>
	<button
		type="button"
		class="format-button"
		class:is-active={activeFormats.underline}
		title={t.underline}
		disabled={editorDisabled}
		onclick={() => onToggleInlineFormat("underline")}
	>
		<Underline size={16} />
	</button>
	<button
		type="button"
		class="format-button"
		class:is-active={activeFormats.strikeThrough}
		title={t.strikethrough}
		disabled={editorDisabled}
		onclick={() => onToggleInlineFormat("strikeThrough")}
	>
		<Strikethrough size={16} />
	</button>
	<select class="font-size-select" title={t.fontSize} disabled={editorDisabled} onchange={(event) => onApplyFontSize(event.currentTarget.value)}>
		<option value="3">{t.fontSize}</option>
		{#each FONT_SIZES as size}
			<option value={size.commandValue}>{size.label}</option>
		{/each}
	</select>
	<div class="color-swatches" aria-label={t.textColor}>
		{#each TEXT_COLORS as color}
			<button
				type="button"
				class="color-swatch"
				style:background-color={color}
				title={t.textColor}
				disabled={editorDisabled}
				onclick={() => onApplyTextColor(color)}
			></button>
		{/each}
	</div>
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
	<div class="mx-1 h-5 w-px bg-black/10"></div>
	<button type="button" class="format-button" title={t.clearFormatting} disabled={editorDisabled} onclick={onClearFormatting}>
		<Eraser size={16} />
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

.font-size-select {
	height: 28px;
	min-width: 58px;
	border-radius: 6px;
	border: 1px solid rgba(0, 0, 0, 0.12);
	background: white;
	padding: 0 6px;
	font-size: 12px;
	color: #3a3a3c;
	outline: none;
}

.font-size-select:disabled {
	cursor: not-allowed;
	opacity: 0.45;
}

.color-swatches {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding-inline: 2px;
}

.color-swatch {
	height: 18px;
	width: 18px;
	border-radius: 999px;
	border: 1px solid rgba(0, 0, 0, 0.16);
	box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.75);
}

.color-swatch:disabled {
	cursor: not-allowed;
	opacity: 0.45;
}
</style>
