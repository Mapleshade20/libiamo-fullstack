<script lang="ts">
import Award from "@lucide/svelte/icons/award";
import Wine from "@lucide/svelte/icons/wine";

interface Props {
	unreadCount: number;
}

let { unreadCount }: Props = $props();
let visibleCount = $derived(unreadCount > 9 ? "9+" : String(unreadCount));
</script>

<span class="emblem" aria-hidden="true">
	<Award size={112} strokeWidth={0.95} />
	<span class="glass"><Wine size={38} strokeWidth={1.35} /></span>
	{#if unreadCount > 0}
		<span class="badge">{visibleCount}</span>
	{/if}
</span>

<style>
.emblem {
	position: relative;
	display: inline-grid;
	width: 7rem;
	height: 7rem;
	place-items: center;
}

.emblem > :global(svg:first-child) {
	opacity: 0.74;
}

.glass {
	position: absolute;
	inset: 30%;
	display: grid;
	place-items: center;
	border-radius: 999px;
	background: color-mix(in oklab, var(--menu-cover) 92%, transparent);
}

.badge {
	position: absolute;
	top: 46%;
	left: 72%;
	display: grid;
	width: 1.55rem;
	height: 1.55rem;
	place-items: center;
	border: 2px solid var(--menu-cover);
	border-radius: 999px;
	background: color-mix(in oklab, var(--menu-brass) 82%, #f7dc78);
	box-shadow: 0 4px 9px rgb(0 0 0 / 24%);
	color: color-mix(in oklab, var(--menu-cover) 88%, black);
	font-family: var(--font-sans);
	font-size: 0.68rem;
	font-weight: 800;
}
</style>
