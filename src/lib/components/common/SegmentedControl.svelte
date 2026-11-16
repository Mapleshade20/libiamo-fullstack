<script lang="ts" module>
import type { LucideIcon } from "@lucide/svelte";
/** `icon`: a lucide icon before the label; with `iconsOnNarrow` only the icon shows on a phone. */
export type SegmentedItem = { value: string; label: string; href?: string; disabled?: boolean; icon?: LucideIcon };
</script>

<script lang="ts">
import { onMount, untrack } from "svelte";
import { cn } from "#lib/utils.ts";

/*
 * One of a few short modes or views: a recess in the desk with a paper slip pushed to the chosen item
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
	iconsOnNarrow = false,
	onValueChange,
	class: className,
}: {
	items: readonly SegmentedItem[];
	value?: string;
	name?: string;
	/** Accessible name of the group. */
	label: string;
	size?: "default" | "sm";
	iconsOnNarrow?: boolean;
	onValueChange?: (value: string) => void;
	class?: string;
} = $props();

const fallbackName = $props.id();
const isNav = $derived(items.some((item) => item.href !== undefined));

let track: HTMLElement | undefined = $state();
let indicator = $state<{ left: number; width: number; right: number } | null>(null);
let animate = $state(false);
// Which way the last move went: the leading edge travels first and the trailing one follows (an elastic slide,
// when a style gives the two edges different timings; the same timing slides as one piece).
let dir = $state<"fwd" | "back">("fwd");

function measure() {
	const active = track?.querySelector<HTMLElement>("[data-segment][data-active='true']");
	if (!active || !track) {
		indicator = null;
		return;
	}
	const next = { left: active.offsetLeft, width: active.offsetWidth, right: track.clientWidth - active.offsetLeft - active.offsetWidth };
	const prev = untrack(() => indicator);
	if (prev && next.left === prev.left && next.right === prev.right) return;
	if (prev && next.left !== prev.left) dir = next.left > prev.left ? "fwd" : "back";
	indicator = next;
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

const trackClass = $derived(cn("segmented relative inline-flex max-w-full items-center gap-0.5 rounded-lg p-[3px]", className));

const itemClass = $derived(
	cn(
		iconsOnNarrow && "max-sm:px-2.5",
		"segment relative z-[1] inline-flex min-w-0 flex-auto cursor-pointer items-center justify-center whitespace-nowrap rounded-[5px] px-3.5 text-sm font-medium text-muted-foreground outline-none transition-colors duration-250 ease-panel hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[active=true]:text-foreground motion-reduce:transition-none",
		size === "sm" ? "h-7 pointer-coarse:h-9" : "h-8 pointer-coarse:h-10",
	),
);
</script>

{#snippet segments()}
	<span
		class="indicator pointer-events-none absolute top-[3px] bottom-[3px] rounded-[5px]"
		class:animate
		data-dir={dir}
		style:left={indicator ? `${indicator.left}px` : "0px"}
		style:right={indicator ? `${indicator.right}px` : "100%"}
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
				{#if item.icon}
					<item.icon class="size-[15px] shrink-0" aria-hidden="true" />
				{/if}
				<span class={cn(item.icon && "ms-1.5", iconsOnNarrow && item.icon && "max-sm:sr-only")}>{item.label}</span>
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
/* The edges move on their own timings: a style may make the leading one quicker (--seg-lead, --seg-trail). */
.segmented {
	--seg-lead: 220ms;
	--seg-trail: 300ms;
}
.indicator.animate {
	transition:
		left var(--seg-trail, 250ms) var(--ease-panel),
		right var(--seg-lead, 250ms) var(--ease-panel);
}
.indicator.animate[data-dir="back"] {
	transition:
		left var(--seg-lead, 250ms) var(--ease-panel),
		right var(--seg-trail, 250ms) var(--ease-panel);
}
/* A groove cut into the desk; the chosen word sits on a paper slip standing up out of it. */
.segmented {
	background: var(--groove);
	box-shadow: var(--groove-shadow);
}
.indicator,
.segmented[data-measured="false"] :global([data-segment][data-active="true"]) {
	background: var(--raised-face);
	box-shadow: var(--raised-shadow);
}
@media (prefers-reduced-motion: reduce) {
	.indicator.animate {
		transition: none;
	}
}
</style>
