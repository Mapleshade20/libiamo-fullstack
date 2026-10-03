<script lang="ts">
import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "$lib/utils.js";

let { ref = $bindable(null), class: className, children, ...restProps }: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr
	bind:this={ref}
	data-slot="table-row"
	class={cn("hover:bg-foreground/[0.025] data-[state=selected]:bg-foreground/[0.05] border-b transition-colors duration-100", className)}
	{...restProps}
>
	{@render children?.()}
</tr>
