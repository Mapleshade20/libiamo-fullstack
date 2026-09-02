<script lang="ts">
import Award from "@lucide/svelte/icons/award";
import Medal from "@lucide/svelte/icons/medal";
import Wine from "@lucide/svelte/icons/wine";
import CoverUnreadBadge from "./CoverUnreadBadge.svelte";

interface Props {
	size?: number;
	frame?: "award" | "medal";
	finish?: "ink" | "foil";
	unreadCount?: number;
	class?: string;
}

let { size = 112, frame = "award", finish = "ink", unreadCount = 0, class: className = "" }: Props = $props();
</script>

<span class="cover-emblem {className}" class:is-foil={finish === "foil"} style:--carte-emblem-size="{size}px" aria-hidden="true">
	<span class="frame" aria-hidden="true">
		{#if frame === "medal"}
			<Medal {size} strokeWidth={0.95} />
		{:else}
			<Award {size} strokeWidth={0.95} />
		{/if}
	</span>
	<span class="glass" aria-hidden="true"><Wine size={Math.round(size * 0.34)} strokeWidth={1.35} /></span>
	<CoverUnreadBadge count={unreadCount} class="emblem-unread-count" />
</span>

<style>
.cover-emblem {
	position: relative;
	display: inline-grid;
	width: var(--carte-emblem-size);
	height: var(--carte-emblem-size);
	place-items: center;
	color: inherit;
	isolation: isolate;
	--carte-unread-badge-size: clamp(1.25rem, calc(var(--carte-emblem-size) * 0.22), 1.65rem);
}

.cover-emblem > :global(.emblem-unread-count) {
	position: absolute;
	top: 47%;
	left: 72%;
	z-index: 3;
}

.frame,
.glass {
	position: absolute;
	display: grid;
	place-items: center;
}

.frame {
	inset: 0;
	opacity: 0.74;
}

.glass {
	inset: 30%;
	z-index: 1;
	border-radius: 999px;
	background: color-mix(in oklab, var(--carte-cover, #6f303a) 92%, transparent);
}

.is-foil {
	color: var(--carte-brass, #b39150);
	filter: drop-shadow(0 1px 0 color-mix(in oklab, white 36%, transparent)) drop-shadow(0 -1px 0 color-mix(in oklab, black 24%, transparent));
}

:global([data-carte-cover="light"]) .glass {
	background: color-mix(in oklab, var(--carte-paper, #f7f1e6) 88%, transparent);
}
</style>
