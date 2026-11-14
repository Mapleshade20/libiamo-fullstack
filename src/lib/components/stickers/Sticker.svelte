<script lang="ts">
import ClinkIcon from "./ClinkIcon.svelte";
import { STICKERS, type StickerName } from "./stickers";

/*
 * One of the navigation stickers. `playing` runs its press animation (stickers.css); hosts set it through
 * `playSticker` on pointerdown or Enter, so a second press replays it.
 */
/* `clink` (the main app's Quest Hall glasses) is a component, ported as it is; the rest are markup. */
let {
	name,
	size = 26,
	tilt = 0,
	playing = false,
	class: className = "",
}: { name: StickerName | "clink"; size?: number; tilt?: number; playing?: boolean; class?: string } = $props();
</script>

<span class="sticker {className}" class:playing style:--st-size="{size}px" style:--tilt="{tilt}deg" aria-hidden="true"
	>{#if name === "clink"}
		<ClinkIcon {playing} />
	{:else}
		{@html STICKERS[name]}
	{/if}</span
>
