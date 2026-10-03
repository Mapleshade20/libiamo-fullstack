<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "$lib/utils";

let {
	title,
	children,
	open: expanded = $bindable(false),
	variant = "boxed",
	class: className,
}: {
	title: string;
	children: Snippet;
	open?: boolean;
	/** `boxed` stands alone on the page; `plain` sits inside a card or a divided list. */
	variant?: "boxed" | "plain";
	class?: string;
} = $props();
const id = $props.id();
</script>

<div class={cn("accordion", variant === "boxed" && "rounded-lg border border-border bg-white/50", className)} data-open={expanded}>
	<button
		type="button"
		{id}
		class={cn(
			"flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg py-2.5 text-left text-sm font-medium outline-none transition-colors duration-150 hover:bg-foreground/[0.03] focus-visible:ring-3 focus-visible:ring-ring/50",
			variant === "boxed" ? "px-3" : "-mx-2 w-[calc(100%+1rem)] px-2",
		)}
		aria-expanded={expanded}
		aria-controls={`${id}-panel`}
		onclick={() => (expanded = !expanded)}
	>
		{title}
		<svg class="chevron size-4 shrink-0 text-muted-foreground" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>
	<div class="panel" id={`${id}-panel`} role="region" aria-labelledby={id} inert={!expanded}>
		<div class="panel-inner"><div class={variant === "boxed" ? "px-3 pt-1 pb-3" : "pt-1 pb-3"}>{@render children()}</div></div>
	</div>
</div>

<style>
.panel {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows 250ms cubic-bezier(0.22, 1, 0.36, 1);
}
.panel-inner {
	min-height: 0;
	overflow: hidden;
	/* Room for a flush control's focus ring, which the clip would otherwise cut off. */
	margin-inline: -4px;
	padding-inline: 4px;
	opacity: 0;
	filter: blur(2px);
	transition:
		opacity 250ms cubic-bezier(0.22, 1, 0.36, 1),
		filter 250ms cubic-bezier(0.22, 1, 0.36, 1);
}
.chevron {
	transform: scaleY(1);
	transition: transform 250ms cubic-bezier(0.22, 1, 0.36, 1);
}
.chevron path {
	vector-effect: non-scaling-stroke;
}
[data-open="true"] > .panel {
	grid-template-rows: 1fr;
}
[data-open="true"] > .panel > .panel-inner {
	opacity: 1;
	filter: blur(0);
}
[data-open="true"] > button > .chevron {
	transform: scaleY(-1);
}
@media (prefers-reduced-motion: reduce) {
	.panel,
	.panel-inner,
	.chevron {
		transition: none;
	}
}
</style>
