<script lang="ts">
import NavIconLink from "./NavIconLink.svelte";
import type { NavRoute } from "./nav-routes";

interface Props {
	routes: NavRoute[];
	activeIndex: number;
	ariaLabel: string;
	onNavigate?: (route: NavRoute, index: number, event: MouseEvent) => void;
	/** Fill the available width and space the clippings evenly, as the bottom bar does. */
	spread?: boolean;
	/** Between clippings — a seam rather than a space once the rail spreads. */
	gap?: string;
}

let { routes, activeIndex, ariaLabel, onNavigate, spread = false, gap = "0.85rem" }: Props = $props();
</script>

<nav class="rail" class:spread aria-label={ariaLabel} style="--rail-gap: {gap}">
	{#each routes as route, index (route.href)}
		<NavIconLink
			href={route.href}
			label={route.label}
			Icon={route.Icon}
			avatarUrl={route.avatarUrl}
			tilt={route.tilt}
			active={index === activeIndex}
			onclick={(event) => onNavigate?.(route, index, event)}
		/>
	{/each}
</nav>

<style>
.rail {
	display: flex;
	align-items: center;
	gap: var(--rail-gap);
}

/*
 * Spread: the columns — not the drawings — are what share the width, so a clipping's cell reaches
 * across the narrow-screen gaps a thumb lands in, and only the rail's gap stays unclaimed.
 */
.spread {
	display: grid;
	grid-auto-flow: column;
	grid-auto-columns: minmax(0, 1fr);
	width: 100%;
}
</style>
