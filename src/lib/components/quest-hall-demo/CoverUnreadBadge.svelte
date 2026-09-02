<script lang="ts">
interface Props {
	count: number;
	class?: string;
}

let { count, class: className = "" }: Props = $props();
let safeCount = $derived(Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
let visibleCount = $derived(safeCount > 9 ? "9+" : String(safeCount));
</script>

{#if safeCount > 0}
	<span class="cover-unread-badge {className}" class:is-overflow={safeCount > 9} aria-hidden="true">{visibleCount}</span>
{/if}

<style>
.cover-unread-badge {
	display: grid;
	box-sizing: border-box;
	width: var(--carte-unread-badge-size, 1.35rem);
	height: var(--carte-unread-badge-size, 1.35rem);
	place-items: center;
	border: 2px solid var(--carte-cover, #6f303a);
	border-radius: 999px;
	background: color-mix(in oklab, var(--carte-brass, #b39150) 82%, #f7dc78);
	box-shadow:
		0 0 0 1px color-mix(in oklab, var(--carte-brass, #b39150) 72%, transparent),
		0 4px 9px color-mix(in oklab, black 24%, transparent);
	color: color-mix(in oklab, var(--carte-cover, #6f303a) 88%, black);
	font-family: var(--font-sans, system-ui, sans-serif);
	font-size: clamp(0.62rem, calc(var(--carte-unread-badge-size, 1.35rem) * 0.42), 0.72rem);
	font-weight: 800;
	font-variant-numeric: tabular-nums;
	letter-spacing: -0.03em;
	line-height: 1;
	transform-origin: center;
	will-change: transform, opacity;
}

.is-overflow {
	font-size: 0.58rem;
}
</style>
