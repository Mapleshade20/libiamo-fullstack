<script lang="ts">
let {
	editor = $bindable(null as HTMLDivElement | null),
	isEmpty = false,
	editorDisabled = false,
	placeholder = "",
	onInput = () => {},
	onKeydown = (_event: KeyboardEvent) => {},
	onBeforeInput = (_event: InputEvent) => {},
	onKeyup = () => {},
	onMouseup = () => {},
	onFocus = () => {},
	onBlur = () => {},
	onPaste = (_event: ClipboardEvent) => {},
}: {
	editor?: HTMLDivElement | null;
	isEmpty?: boolean;
	editorDisabled?: boolean;
	placeholder?: string;
	onInput?: () => void;
	onKeydown?: (event: KeyboardEvent) => void;
	onBeforeInput?: (event: InputEvent) => void;
	onKeyup?: () => void;
	onMouseup?: () => void;
	onFocus?: () => void;
	onBlur?: () => void;
	onPaste?: (event: ClipboardEvent) => void;
} = $props();
</script>

<div class="editor-wrap min-h-0 flex-1">
	{#if isEmpty}
		<div class="editor-placeholder">{placeholder}</div>
	{/if}
	<div
		bind:this={editor}
		class="body-editor"
		class:is-disabled={editorDisabled}
		contenteditable={!editorDisabled}
		role="textbox"
		aria-multiline="true"
		tabindex="0"
		oninput={onInput}
		onkeydown={onKeydown}
		onbeforeinput={onBeforeInput}
		onkeyup={onKeyup}
		onmouseup={onMouseup}
		onfocus={onFocus}
		onblur={onBlur}
		onpaste={onPaste}
	></div>
</div>

<style>
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
</style>
