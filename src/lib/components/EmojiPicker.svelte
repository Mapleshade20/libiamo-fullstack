<script lang="ts">
import { createEventDispatcher, onMount } from "svelte";
import "emoji-picker-element";

const dispatch = createEventDispatcher();

function handleEmojiClick(event: any) {
	const emojiUnicode = event.detail.unicode;
	dispatch("emoji-selected", { unicode: emojiUnicode });
}
</script>

<emoji-picker onemoji-click={handleEmojiClick}></emoji-picker>

<style>
emoji-picker {
	width: 100%;
	height: 100%;
	--num-columns: 8;
	--category-emoji-size: 1.25rem;
}
</style>
