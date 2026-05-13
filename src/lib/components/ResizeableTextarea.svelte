<!-- ResizeableTextarea.svelte -->
<script lang="ts">
let { value = $bindable(""), maxRows = 10, placeholder = "", disabled = false, onKeyDown } = $props();

let textarea = $state<HTMLTextAreaElement>();
const LINE_HEIGHT = 24;
const PADDING = 20;

let isOverflow = $state(false);

function resize() {
	if (!textarea) return;
	textarea.style.height = "auto";
	const scrollHeight = textarea.scrollHeight;
	const maxHeight = maxRows * LINE_HEIGHT + PADDING;

	if (scrollHeight > maxHeight) {
		textarea.style.height = `${maxHeight}px`;
		isOverflow = true;
	} else {
		textarea.style.height = `${scrollHeight}px`;
		isOverflow = false;
	}
}

$effect(() => {
	value;
	resize();
});
</script>

<textarea
	bind:this={textarea}
	bind:value
	{placeholder}
	{disabled}
	onkeydown={onKeyDown}
	rows="1"
	class="custom-textarea hide-scrollbar"
	style:overflow-y={isOverflow ? 'auto' : 'hidden'}
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
