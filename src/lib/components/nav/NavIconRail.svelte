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

.spread {
	width: 100%;
	justify-content: space-around;
	gap: 0;
}
</style>
