<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "$lib/utils";

let {
	title,
	children,
	open: expanded = $bindable(false),
	class: className,
}: {
	title: string;
	children: Snippet;
	open?: boolean;
	class?: string;
} = $props();
const id = $props.id();
</script>

<div class={cn("accordion rounded-lg border border-border", className)} data-open={expanded}>
	<button
		type="button"
		{id}
		class="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
		aria-expanded={expanded}
		aria-controls={`${id}-panel`}
		onclick={() => (expanded = !expanded)}
	>
		{title}
		<svg class="chevron size-4 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M4 6.5L8 10.5L12 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>
	<div class="panel" id={`${id}-panel`} role="region" aria-labelledby={id} inert={!expanded}>
		<div class="panel-inner"><div class="px-3 pb-3">{@render children()}</div></div>
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
