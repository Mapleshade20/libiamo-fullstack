<script lang="ts">
import type { HTMLAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "$lib/utils.js";

let { ref = $bindable(null), class: className, children, ...restProps }: WithElementRef<HTMLAttributes<HTMLHeadingElement>> = $props();
</script>

<h2
	bind:this={ref}
	data-slot="card-title"
	class={cn("font-serif text-xl leading-snug font-medium group-data-[size=sm]/card:text-lg", className)}
	{...restProps}
>
	{@render children?.()}
</h2>
