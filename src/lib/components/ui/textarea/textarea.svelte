<script lang="ts">
import type { HTMLTextareaAttributes } from "svelte/elements";
import { cn, type WithElementRef, type WithoutChildren } from "$lib/utils.js";

let {
	ref = $bindable(null),
	value = $bindable(),
	class: className,
	"data-slot": dataSlot = "textarea",
	...restProps
}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		"border-input bg-white/80 hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive dark:bg-input/30 rounded-lg border text-sm text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:ring-3 aria-invalid:ring-3 w-full min-w-0 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-transparent read-only:hover:border-input motion-reduce:transition-none flex field-sizing-content min-h-20 px-3 py-2.5 leading-relaxed",
		className
	)}
	bind:value
	{...restProps}
></textarea>
