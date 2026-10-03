<script lang="ts" module>
export type SegmentedItem = { value: string; label: string; href?: string; disabled?: boolean };
</script>

<script lang="ts">
import { onMount } from "svelte";
import { cn } from "$lib/utils";

/*
 * One of a few short modes or views: a pill track whose indicator slides to the chosen item
 * (transitions.dev "Tabs sliding"). Items with `href` render as sub-navigation links marked with
 * `aria-current`; otherwise they are native radios, so `name` submits with a form and arrow keys move
 * between them. Before the indicator is measured, the chosen item paints its own pill, so the server
 * render and the first frame already show the selection. Without `name` the radios only group
 * (and are kept out of any surrounding form).
 */
let {
	items,
	value = $bindable(""),
	name,
	label,
	size = "default",
	onValueChange,
	class: className,
}: {
	items: readonly SegmentedItem[];
	value?: string;
	name?: string;
	/** Accessible name of the group. */
	label: string;
	size?: "default" | "sm";
	onValueChange?: (value: string) => void;
	class?: string;
} = $props();

const fallbackName = $props.id();
const isNav = $derived(items.some((item) => item.href !== undefined));

let track: HTMLElement | undefined = $state();
let indicator = $state<{ left: number; width: number } | null>(null);
let animate = $state(false);

function measure() {
	const active = track?.querySelector<HTMLElement>("[data-segment][data-active='true']");
	indicator = active ? { left: active.offsetLeft, width: active.offsetWidth } : null;
}

$effect(() => {
	void value;
	void items;
	measure();
});

onMount(() => {
	measure();
	// Only slide after the first placement, so the pill does not fly in on load.
	const frame = requestAnimationFrame(() => (animate = true));
	const observer = new ResizeObserver(measure);
	if (track) observer.observe(track);
	return () => {
		cancelAnimationFrame(frame);
		observer.disconnect();
	};
});

function choose(next: string) {
	value = next;
	onValueChange?.(next);
}

const trackClass = $derived(cn("segmented relative inline-flex max-w-full items-center gap-0.5 rounded-full bg-foreground/[0.06] p-1", className));

const itemClass = $derived(
	cn(
		"segment relative z-[1] inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-3.5 text-sm font-medium text-muted-foreground outline-none transition-colors duration-250 ease-panel hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[active=true]:text-foreground motion-reduce:transition-none",
		size === "sm" ? "h-7 pointer-coarse:h-9" : "h-8 pointer-coarse:h-10",
	),
);
</script>

{#snippet segments()}
	<span
		class="indicator pointer-events-none absolute top-1 bottom-1 left-0 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_rgb(0_0_0/0.04)] dark:bg-input"
		class:animate
		style:width={indicator ? `${indicator.width}px` : "0px"}
		style:transform={indicator ? `translateX(${indicator.left}px)` : undefined}
		style:opacity={indicator ? 1 : 0}
		aria-hidden="true"
	></span>
	{#each items as item (item.value)}
		{@const active = item.value === value}
		{#if item.href !== undefined}
			<a
				href={item.disabled ? undefined : item.href}
				class={itemClass}
				data-segment
				data-active={active}
				aria-current={active ? "page" : undefined}
				aria-disabled={item.disabled}
				onclick={() => choose(item.value)}
				>{item.label}</a
			>
		{:else}
			<label class={cn(itemClass, "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50")} data-segment data-active={active}>
				<input
					type="radio"
					class="sr-only"
					name={name ?? fallbackName}
					form={name ? undefined : `${fallbackName}-none`}
					value={item.value}
					checked={active}
					disabled={item.disabled}
					onchange={() => choose(item.value)}
				>
				{item.label}
			</label>
		{/if}
	{/each}
{/snippet}

{#if isNav}
	<nav bind:this={track} aria-label={label} data-measured={indicator ? "true" : "false"} class={trackClass}>{@render segments()}</nav>
{:else}
	<div bind:this={track} role="radiogroup" aria-label={label} data-measured={indicator ? "true" : "false"} class={trackClass}>
		{@render segments()}
	</div>
{/if}

<style>
.indicator.animate {
	transition:
		transform 250ms var(--ease-panel),
		width 250ms var(--ease-panel);
}
/* Until the indicator is placed, the chosen item paints the same pill itself. */
.segmented[data-measured="false"] :global([data-segment][data-active="true"]) {
	background: #fff;
	box-shadow:
		0 1px 2px rgb(0 0 0 / 0.08),
		0 0 0 0.5px rgb(0 0 0 / 0.04);
}
@media (prefers-reduced-motion: reduce) {
	.indicator.animate {
		transition: none;
	}
}
</style>
