<script lang="ts">
import { onMount } from "svelte";

interface Props {
	onEmojiSelected?: (event: CustomEvent) => void;
}
let { onEmojiSelected }: Props = $props();
let isLoaded = $state(false);

onMount(async () => {
	try {
		await import("emoji-picker-element");
		isLoaded = true;
	} catch (error) {
		console.error("Failed to load emoji picker script", error);
	}
});
</script>

{#if isLoaded}
	<emoji-picker
		class="light"
		onemoji-click={onEmojiSelected}
		data-source="https://unpkg.com/emoji-picker-element-data@^1/en/emojibase/data.json"
	></emoji-picker>
{:else}
	<div class="flex h-64 w-full items-center justify-center p-4">
		<div class="flex items-center gap-2">
			<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]"></span>
			<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]" style="animation-delay: 0.2s"></span>
			<span class="h-2 w-2 animate-bounce rounded-full bg-[#80848E]" style="animation-delay: 0.4s"></span>
		</div>
	</div>
{/if}

<style>
emoji-picker {
	width: 100%;
	height: 320px;
	--background: #2b2d31;
	--border-color: #1e1f22;
	--category-icon-color: #80848e;
	--indicator-color: #5865f2;
}
</style>
