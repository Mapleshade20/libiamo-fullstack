<script lang="ts">
import type { HTMLTextareaAttributes } from "svelte/elements";

let {
	value = $bindable(""),
	textarea = $bindable(),
	maxRows = 10,
	maxLength,
	placeholder = "",
	label,
	disabled = false,
	onKeyDown,
	...rest
}: {
	value?: string;
	textarea?: HTMLTextAreaElement;
	maxRows?: number;
	maxLength?: number;
	placeholder?: string;
	label: string;
	disabled?: boolean;
	onKeyDown?: (event: KeyboardEvent) => void;
} & Pick<
	HTMLTextareaAttributes,
	"role" | "aria-expanded" | "aria-controls" | "aria-activedescendant" | "aria-autocomplete" | "oninput" | "onclick" | "onkeyup"
> = $props();

let isOverflow = $state(false);
const LINE_HEIGHT = 24;
const PADDING = 20;

$effect(() => {
	value;
	if (!textarea) return;
	textarea.style.height = "auto";
	const maxHeight = maxRows * LINE_HEIGHT + PADDING;
	isOverflow = textarea.scrollHeight > maxHeight;
	textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
});
</script>

<textarea
	bind:this={textarea}
	bind:value
	{placeholder}
	{disabled}
	aria-label={label}
	maxlength={maxLength}
	onkeydown={onKeyDown}
	{...rest}
	rows="1"
	class="custom-textarea"
	style:overflow-y={isOverflow ? "auto" : "hidden"}
></textarea>

<style>
.custom-textarea {
	width: 100%;
	min-height: 44px;
	padding: 10px 12px;
	resize: none;
	border: none;
	background: transparent;
	color: currentColor;
	line-height: 24px;
	outline: none;
	font-family: inherit;
	display: block;
}

.custom-textarea::-webkit-scrollbar {
	width: 4px;
}
.custom-textarea::-webkit-scrollbar-thumb {
	background: #1e1f22;
	border-radius: 4px;
}
</style>
